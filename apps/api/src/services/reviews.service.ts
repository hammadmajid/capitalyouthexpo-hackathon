import { and, eq } from 'drizzle-orm';
import { reports, reviewReplies, reviewRevisions, reviews, type Database } from '@hsm/db';
import {
  DomainError,
  type InventoryPermission,
  isReviewEligible,
  ownReviewSchema,
  publicReviewPageSchema,
  reviewEditInputSchema,
  reviewEligibilitySchema,
  reviewEligibleFrom,
  reviewInputSchema,
  reviewReplyInputSchema,
  reviewReportInputSchema,
  staffReviewPageSchema,
  staffReviewSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import { z } from 'zod';
import type { Actor } from '../authorization/store.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { requireTransaction } from '../idempotency/context.js';
import type { IdempotencyService } from '../idempotency/service.js';
import { inventoryFailure } from '../booking/errors.js';
import { karachiToday } from './dates.js';
import { lockOwnStay, lockStaffScope, replayAuthorizer } from './scope.js';
import { requirePublicBranch } from './public-branch.js';
import { notify } from './notify.js';
import { ReviewRepository } from './reviews.repository.js';
const id = stayIdentifierSchema;
const pageQuery = z
  .object({
    cursor: id.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
const reportResult = z.object({ reportId: id, status: z.literal('open') }).strict();
type OwnStay = Awaited<ReturnType<typeof lockOwnStay>>['stay'];
function conflict(message: string): never {
  throw new DomainError('CONFLICT', 409, message);
}
// REV-001..006: verified-Stay reviews. Eligibility, uniqueness and edit history are enforced
// here and in PostgreSQL; staff may only reply; moderation is a platform role (Phase 10).
export class ReviewService {
  constructor(
    private readonly database: Database,
    private readonly idempotency: IdempotencyService,
    private readonly clock: () => Date = () => new Date(),
    private readonly repository = new ReviewRepository(),
    private readonly audit = new AuditWriter(),
  ) {}
  private eligibility(stay: OwnStay, reviewId: string | null) {
    if (!stay.checkedInAt)
      return {
        stayId: stay.id,
        eligible: false,
        eligibleFrom: null,
        reason: 'not_checked_in' as const,
        reviewId,
      };
    const from = reviewEligibleFrom(karachiToday(stay.checkedInAt)),
      last = karachiToday(stay.closedAt ?? this.clock());
    if (reviewId)
      return {
        stayId: stay.id,
        eligible: false,
        eligibleFrom: from,
        reason: 'already_reviewed' as const,
        reviewId,
      };
    if (!isReviewEligible(karachiToday(stay.checkedInAt), last))
      return {
        stayId: stay.id,
        eligible: false,
        eligibleFrom: from,
        reason: 'too_early' as const,
        reviewId,
      };
    return {
      stayId: stay.id,
      eligible: true,
      eligibleFrom: from,
      reason: 'eligible' as const,
      reviewId,
    };
  }
  checkEligibility(actor: Actor, stayId: unknown) {
    const stay = id.parse(stayId);
    return this.database.transaction(async (tx) => {
      const own = await lockOwnStay(tx, actor, stay, this.clock, false);
      const existing = await this.repository.own(tx, stay);
      return reviewEligibilitySchema.parse(this.eligibility(own.stay, existing?.id ?? null));
    });
  }
  own(actor: Actor, stayId: unknown) {
    const stay = id.parse(stayId);
    return this.database.transaction(async (tx) => {
      await lockOwnStay(tx, actor, stay, this.clock, false);
      const review = await this.repository.own(tx, stay);
      if (!review) throw new DomainError('NOT_FOUND', 404, 'No review yet');
      return review;
    });
  }
  create(actor: Actor, key: unknown, stayId: unknown, body: unknown) {
    const stay = id.parse(stayId),
      input = reviewInputSchema.parse(body);
    return this.command(actor, key, 'POST stay review', 201, { stay }, input, async (tx) => {
      const own = await lockOwnStay(tx, actor, stay, this.clock, false);
      const verdict = this.eligibility(own.stay, (await this.repository.own(tx, stay))?.id ?? null);
      if (!verdict.eligible)
        throw new DomainError(
          'FORBIDDEN',
          403,
          verdict.reason === 'already_reviewed'
            ? 'This Stay already has a review'
            : 'This Stay is not eligible for a review yet',
        );
      const now = this.clock();
      const [row] = await tx
        .insert(reviews)
        .values({
          branchId: own.stay.branchId,
          stayId: stay,
          userId: actor.userId,
          body: input.body ?? null,
          status: 'published',
          version: 1,
          createdAt: now,
        })
        .onConflictDoNothing()
        .returning();
      if (!row) conflict('This Stay already has a review');
      await this.repository.writeRatings(tx, row.id, input.ratings);
      return this.repository.own(tx, stay);
    });
  }
  // p.35 edit policy: the author edits; every previous version is kept for moderation.
  edit(actor: Actor, key: unknown, stayId: unknown, body: unknown) {
    const stay = id.parse(stayId),
      input = reviewEditInputSchema.parse(body);
    return this.command(actor, key, 'PATCH stay review', 200, { stay }, input, async (tx) => {
      await lockOwnStay(tx, actor, stay, this.clock, false);
      const current = await this.repository.own(tx, stay);
      if (!current) throw new DomainError('NOT_FOUND', 404, 'No review yet');
      const row = await this.repository.lock(tx, current.id);
      if (row.userId !== actor.userId) throw new DomainError('NOT_FOUND', 404, 'No review yet');
      if (row.version !== input.expectedVersion) conflict('The review changed; reload first');
      if (row.status === 'removed') conflict('A removed review cannot be edited');
      const now = this.clock();
      await tx.insert(reviewRevisions).values({
        reviewId: row.id,
        previousBody: row.body,
        previousRatings: await this.repository.currentRatings(tx, row.id),
        editedAt: now,
      });
      await tx
        .update(reviews)
        .set({ body: input.body ?? null, editedAt: now, version: row.version + 1 })
        .where(eq(reviews.id, row.id));
      await this.repository.writeRatings(tx, row.id, input.ratings);
      return this.repository.own(tx, stay);
    });
  }
  publicPage(branchId: unknown, query: unknown) {
    const branch = id.parse(branchId),
      input = pageQuery.parse(query);
    return this.database.transaction(async (tx) => {
      await requirePublicBranch(tx, branch);
      const page = await this.repository.page(tx, branch, 'public', input.cursor, input.limit);
      return publicReviewPageSchema.parse({
        branchId: branch,
        summary: await this.repository.summary(tx, branch),
        ...page,
      });
    });
  }
  staffPage(actor: Actor, branchId: unknown, query: unknown) {
    const branch = id.parse(branchId),
      input = pageQuery.parse(query);
    return this.database.transaction(async (tx) => {
      await lockStaffScope(tx, actor, branch, [], this.clock);
      return staffReviewPageSchema.parse(
        await this.repository.page(tx, branch, 'staff', input.cursor, input.limit),
      );
    });
  }
  // REV-005: one public reply per review, by staff with listing_edit; text is never the review's.
  reply(actor: Actor, key: unknown, branchId: unknown, reviewId: unknown, body: unknown) {
    const branch = id.parse(branchId),
      review = id.parse(reviewId),
      input = reviewReplyInputSchema.parse(body);
    return this.idempotency
      .execute(
        { actor, key: id.parse(key), endpoint: 'PUT review reply', status: 200 },
        { branch, review },
        input,
        staffReviewSchema,
        replayAuthorizer(actor, this.clock, { branch, review }, ['listing_edit']),
        async () => {
          const tx = requireTransaction();
          const scope = await lockStaffScope(tx, actor, branch, ['listing_edit'], this.clock);
          const row = await this.repository.lock(tx, review);
          if (row.branchId !== branch)
            throw new DomainError('NOT_FOUND', 404, 'Review unavailable');
          if (row.status !== 'published') conflict('Only a published review can be answered');
          const now = this.clock();
          const [previous] = await tx
            .select()
            .from(reviewReplies)
            .where(eq(reviewReplies.reviewId, row.id))
            .for('update');
          if (previous)
            await tx
              .update(reviewReplies)
              .set({ body: input.body, editedAt: now })
              .where(eq(reviewReplies.id, previous.id));
          else
            await tx.insert(reviewReplies).values({
              reviewId: row.id,
              authorUserId: actor.userId,
              body: input.body,
              createdAt: now,
            });
          await this.audit.hostel(tx, {
            organizationId: scope.organizationId,
            branchId: branch,
            actorUserId: actor.userId,
            actorRole: scope.actorRole,
            action: previous ? 'review.reply.edited' : 'review.reply.created',
            targetType: 'review',
            targetId: row.id,
            before: previous ? { body: previous.body } : null,
            after: { body: input.body },
            createdAt: now,
          });
          if (!previous) await notify(tx, row.userId, 'resident.review_replied', row.id, now);
          const own = await this.repository.own(tx, row.stayId);
          if (!own) throw new DomainError('INTERNAL', 500, 'Review unavailable');
          return staffReviewSchema.strip().parse(own);
        },
      )
      .catch(inventoryFailure);
  }
  // p.35 review report: any signed-in user may flag a published review for content policy.
  report(actor: Actor, key: unknown, reviewId: unknown, body: unknown) {
    const review = id.parse(reviewId),
      input = reviewReportInputSchema.parse(body);
    return this.idempotency
      .execute(
        { actor, key: id.parse(key), endpoint: 'POST review report', status: 201 },
        { review },
        input,
        reportResult,
        replayAuthorizer(actor, this.clock, { review }),
        async () => {
          const tx = requireTransaction();
          await lockActor(tx, actor, this.clock);
          const [row] = await tx
            .select({ id: reviews.id })
            .from(reviews)
            .where(and(eq(reviews.id, review), eq(reviews.status, 'published')));
          if (!row) throw new DomainError('NOT_FOUND', 404, 'Review unavailable');
          const [open] = await tx
            .select({ id: reports.id })
            .from(reports)
            .where(
              and(
                eq(reports.reporterUserId, actor.userId),
                eq(reports.targetType, 'review'),
                eq(reports.targetId, review),
                eq(reports.status, 'open'),
              ),
            );
          if (open) conflict('You already reported this review');
          const [created] = await tx
            .insert(reports)
            .values({
              reporterUserId: actor.userId,
              targetType: 'review',
              targetId: review,
              reason: input.reason,
              details: input.details ?? null,
              createdAt: this.clock(),
            })
            .returning({ id: reports.id });
          if (!created) throw new DomainError('INTERNAL', 500, 'Report unavailable');
          return { reportId: created.id, status: 'open' as const };
        },
      )
      .catch(inventoryFailure);
  }
  private command<T>(
    actor: Actor,
    key: unknown,
    endpoint: string,
    status: 200 | 201,
    scope: Record<string, string>,
    input: T,
    work: (tx: Transaction) => Promise<unknown>,
    grants: readonly InventoryPermission[] = [],
  ) {
    return this.idempotency
      .execute(
        { actor, key: id.parse(key), endpoint, status },
        scope,
        input,
        ownReviewSchema,
        replayAuthorizer(actor, this.clock, scope, grants),
        async () => work(requireTransaction()),
      )
      .catch(inventoryFailure);
  }
}
