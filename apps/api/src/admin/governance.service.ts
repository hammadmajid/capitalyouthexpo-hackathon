import { and, desc, eq, lt } from 'drizzle-orm';
import { v7 } from 'uuid';
import {
  branchVerificationEvents,
  branches,
  moderationActions,
  organizations,
  reports,
  reviews,
  verificationSubmissions,
  verificationDecisionSubmissions,
  type Database,
} from '@hsm/db';
import {
  DomainError,
  nextVerificationStatus,
  reportDismissInputSchema,
  reviewModerationInputSchema,
  reviewReportQueueSchema,
  stayIdentifierSchema,
  verificationCommandInputSchema,
  verificationQueueItemSchema,
  verificationQueueQuerySchema,
  verificationQueueSchema,
} from '@hsm/contracts';
import { z } from 'zod';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import { requireTransaction } from '../idempotency/context.js';
import type { IdempotencyService } from '../idempotency/service.js';
import { inventoryFailure } from '../booking/errors.js';
import { lockAdmin, platformAudit, type AdminRole } from './scope.js';
import { notify } from '../services/notify.js';
const id = stayIdentifierSchema;
const pageQuery = z
  .object({ cursor: id.optional(), limit: z.coerce.number().int().min(1).max(50).default(20) })
  .strict();
const moderationResult = z
  .object({
    reviewId: id,
    status: z.enum(['published', 'hidden', 'removed']),
    version: z.number().int().positive(),
  })
  .strict();
const dismissResult = z.object({ reportId: id, status: z.literal('dismissed') }).strict();
function conflict(message: string): never {
  throw new DomainError('CONFLICT', 409, message);
}
// ADM-007/008: hostel verification and content moderation by role-specific Normal Admins (or
// Root). Moderation changes visibility only; rent, inventory and deposits are never touched.
export class GovernanceService {
  constructor(
    private readonly database: Database,
    private readonly idempotency: IdempotencyService,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  verificationQueue(actor: Actor, query: unknown) {
    const input = verificationQueueQuerySchema.parse(query);
    return this.database.transaction(async (tx) => {
      await lockAdmin(tx, actor, 'verification', this.clock);
      const rows = await tx
        .select({
          branchId: branches.id,
          branchName: branches.name,
          organizationName: organizations.name,
          status: branches.verificationStatus,
          updatedAt: branches.updatedAt,
        })
        .from(branches)
        .innerJoin(organizations, eq(organizations.id, branches.organizationId))
        .where(
          and(
            eq(branches.verificationStatus, input.status),
            input.cursor ? lt(branches.id, input.cursor) : undefined,
          ),
        )
        .orderBy(desc(branches.id))
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      return verificationQueueSchema.parse({
        data: page.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() })),
        nextCursor: rows.length > input.limit ? (page.at(-1)?.branchId ?? null) : null,
      });
    });
  }
  decideVerification(actor: Actor, key: unknown, branchId: unknown, body: unknown) {
    const branch = id.parse(branchId),
      input = verificationCommandInputSchema.parse(body);
    return this.command(
      actor,
      key,
      'POST branch verification',
      'verification',
      { branch, ...input },
      verificationQueueItemSchema,
      async (tx) => {
        const scope = await lockAdmin(tx, actor, 'verification', this.clock),
          now = this.clock();
        const [row] = await tx.select().from(branches).where(eq(branches.id, branch)).for('update');
        if (!row) throw new DomainError('NOT_FOUND', 404, 'Branch unavailable');
        if (input.expectedStatus && input.expectedStatus !== row.verificationStatus)
          conflict('The verification status changed; reload first');
        if (
          input.expectedUpdatedAt &&
          new Date(input.expectedUpdatedAt).getTime() !== row.updatedAt.getTime()
        )
          conflict('The verification dossier changed; reload first');
        const move = nextVerificationStatus(row.verificationStatus, input.action);
        if (!move) conflict('That decision is not available for this branch now');
        if (move.reasonRequired && !input.reason)
          throw new DomainError('VALIDATION_FAILED', 400, 'A reason is required');
        await tx
          .update(branches)
          .set({ verificationStatus: move.to, updatedAt: now })
          .where(eq(branches.id, branch));
        const eventId = v7();
        await tx.insert(branchVerificationEvents).values({
          id: eventId,
          branchId: branch,
          adminUserId: actor.userId,
          fromStatus: row.verificationStatus,
          toStatus: move.to,
          reason: input.reason ?? null,
          createdAt: now,
        });
        const [submission] = await tx
          .select({ id: verificationSubmissions.id })
          .from(verificationSubmissions)
          .where(eq(verificationSubmissions.branchId, branch))
          .orderBy(desc(verificationSubmissions.id))
          .limit(1);
        if (submission)
          await tx
            .insert(verificationDecisionSubmissions)
            .values({ eventId, submissionId: submission.id });
        await platformAudit(
          tx,
          scope,
          {
            action: 'verification.' + input.action,
            targetType: 'branch',
            targetId: branch,
            before: { status: row.verificationStatus },
            after: { status: move.to, reason: input.reason ?? null },
          },
          now,
        );
        const [org] = await tx
          .select({ name: organizations.name, ownerId: organizations.ownerUserId })
          .from(organizations)
          .where(eq(organizations.id, row.organizationId));
        if (!org) throw new DomainError('NOT_FOUND', 404, 'Owner unavailable');
        await notify(tx, org.ownerId, 'owner.verification_updated', eventId, now);
        return {
          branchId: branch,
          branchName: row.name,
          organizationName: org?.name ?? '',
          status: move.to,
          updatedAt: now.toISOString(),
        };
      },
    );
  }
  reviewReports(actor: Actor, query: unknown) {
    const input = pageQuery.parse(query);
    return this.database.transaction(async (tx) => {
      await lockAdmin(tx, actor, 'content_moderator', this.clock);
      const rows = await tx
        .select({ report: reports, review: reviews })
        .from(reports)
        .innerJoin(reviews, eq(reviews.id, reports.targetId))
        .where(
          and(
            eq(reports.targetType, 'review'),
            eq(reports.status, 'open'),
            input.cursor ? lt(reports.id, input.cursor) : undefined,
          ),
        )
        .orderBy(desc(reports.id))
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      return reviewReportQueueSchema.parse({
        data: page.map(({ report, review }) => ({
          reportId: report.id,
          reviewId: review.id,
          branchId: review.branchId,
          reason: report.reason,
          details: report.details,
          status: report.status,
          reviewStatus: review.status,
          reviewBody: review.body,
          reviewVersion: review.version,
          createdAt: report.createdAt.toISOString(),
        })),
        nextCursor: rows.length > input.limit ? (page.at(-1)?.report.id ?? null) : null,
      });
    });
  }
  // REV-006: hide/remove/restore needs a written policy reason; the action is evidence.
  moderateReview(actor: Actor, key: unknown, reviewId: unknown, body: unknown) {
    const review = id.parse(reviewId),
      input = reviewModerationInputSchema.parse(body);
    return this.command(
      actor,
      key,
      'POST review moderation',
      'content_moderator',
      { review, ...input },
      moderationResult,
      async (tx) => {
        const scope = await lockAdmin(tx, actor, 'content_moderator', this.clock),
          now = this.clock();
        const [row] = await tx.select().from(reviews).where(eq(reviews.id, review)).for('update');
        if (!row) throw new DomainError('NOT_FOUND', 404, 'Review unavailable');
        if (row.version !== input.expectedVersion) conflict('The review changed; reload first');
        if (input.reportId) {
          const [report] = await tx
            .select()
            .from(reports)
            .where(eq(reports.id, input.reportId))
            .for('update');
          if (
            !report ||
            report.targetType !== 'review' ||
            report.targetId !== review ||
            report.status !== 'open'
          )
            conflict('The report no longer matches an open case for this review');
        }
        const status =
          input.action === 'restore' ? 'published' : input.action === 'hide' ? 'hidden' : 'removed';
        if (status === row.status) conflict('The review already has that state');
        await tx
          .update(reviews)
          .set({
            status,
            moderationReason: status === 'published' ? null : input.reason,
            version: row.version + 1,
          })
          .where(eq(reviews.id, review));
        await tx.insert(moderationActions).values({
          adminUserId: actor.userId,
          action: input.action + '_review',
          targetType: 'review',
          targetId: review,
          reason: input.reason,
          reportId: input.reportId ?? null,
          createdAt: now,
        });
        if (input.reportId)
          await tx
            .update(reports)
            .set({
              status: 'actioned',
              handledByUserId: actor.userId,
              resolution: input.reason,
              resolvedAt: now,
            })
            .where(
              and(
                eq(reports.id, input.reportId),
                eq(reports.targetId, review),
                eq(reports.status, 'open'),
              ),
            );
        await platformAudit(
          tx,
          scope,
          {
            action: 'review.' + input.action,
            targetType: 'review',
            targetId: review,
            before: { status: row.status },
            after: { status, reason: input.reason },
          },
          now,
        );
        return { reviewId: review, status, version: row.version + 1 };
      },
    );
  }
  dismissReport(actor: Actor, key: unknown, reportId: unknown, body: unknown) {
    const report = id.parse(reportId),
      input = reportDismissInputSchema.parse(body);
    return this.command(
      actor,
      key,
      'POST review report dismiss',
      'content_moderator',
      { report, ...input },
      dismissResult,
      async (tx) => {
        const scope = await lockAdmin(tx, actor, 'content_moderator', this.clock),
          now = this.clock();
        const [row] = await tx
          .select()
          .from(reports)
          .where(and(eq(reports.id, report), eq(reports.targetType, 'review')))
          .for('update');
        if (!row) throw new DomainError('NOT_FOUND', 404, 'Report unavailable');
        if (row.status !== 'open') conflict('This report was already handled');
        await tx
          .update(reports)
          .set({
            status: 'dismissed',
            handledByUserId: actor.userId,
            resolution: input.reason,
            resolvedAt: now,
          })
          .where(eq(reports.id, report));
        await tx.insert(moderationActions).values({
          adminUserId: actor.userId,
          action: 'dismiss_report',
          targetType: 'review',
          targetId: row.targetId,
          reason: input.reason,
          reportId: report,
          createdAt: now,
        });
        await platformAudit(
          tx,
          scope,
          {
            action: 'report.dismissed',
            targetType: 'report',
            targetId: report,
            after: { reason: input.reason },
          },
          now,
        );
        return { reportId: report, status: 'dismissed' as const };
      },
    );
  }
  private command<T>(
    actor: Actor,
    key: unknown,
    endpoint: string,
    role: AdminRole,
    input: unknown,
    schema: z.ZodType<T>,
    work: (tx: Transaction) => Promise<unknown>,
  ) {
    return this.idempotency
      .execute(
        { actor, key: id.parse(key), endpoint, status: 200 },
        {},
        input,
        schema,
        async (tx) => Boolean(await lockAdmin(tx, actor, role, this.clock)),
        async () => work(requireTransaction()),
      )
      .catch(inventoryFailure);
  }
}
