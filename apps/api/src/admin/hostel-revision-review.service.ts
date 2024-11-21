import { and, asc, eq, gt, inArray } from 'drizzle-orm';
import { v7 } from 'uuid';
import {
  areas,
  brands,
  branches,
  cities,
  hostelRevisions,
  organizations,
  type Database,
} from '@hsm/db';
import {
  DomainError,
  hostelRevisionChangesSchema,
  hostelRevisionDecisionSchema,
  hostelRevisionQueueQuerySchema,
  hostelRevisionQueueSchema,
  hostelRevisionReviewSchema,
  hostelRevisionSchema,
} from '@hsm/contracts';
import { z } from 'zod';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import { requireTransaction } from '../idempotency/context.js';
import type { IdempotencyService } from '../idempotency/service.js';
import { inventoryFailure } from '../booking/errors.js';
import { notify } from '../services/notify.js';
import { lockAdmin, platformAudit } from './scope.js';
import { projectRevision } from '../management/hostel-revision.repository.js';
import {
  previewBranch,
  requireCompleteRevision,
  requireVersion,
} from '../management/hostel-revision.policy.js';
import {
  mainBranchValues,
  readHostelSetup,
  validateSetupGeography,
} from '../management/hostel-setup.projection.js';
const id = z.string().uuid();
// CHG-041 / ADM-007: verification Admins review edits to an approved hostel. Approving copies
// them onto the live rows in one locked transaction; rejecting leaves the live listing as is.
export class HostelRevisionReviewService {
  constructor(
    private readonly database: Database,
    private readonly idempotency: IdempotencyService,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  queue(actor: Actor, query: unknown) {
    const input = hostelRevisionQueueQuerySchema.parse(query);
    return this.database.transaction(async (tx) => {
      await lockAdmin(tx, actor, 'verification', this.clock);
      const rows = await tx
        .select({
          id: hostelRevisions.id,
          brandId: hostelRevisions.brandId,
          branchId: hostelRevisions.branchId,
          branchName: branches.name,
          organizationName: organizations.name,
          submittedAt: hostelRevisions.submittedAt,
        })
        .from(hostelRevisions)
        .innerJoin(branches, eq(branches.id, hostelRevisions.branchId))
        .innerJoin(organizations, eq(organizations.id, branches.organizationId))
        .where(
          and(
            eq(hostelRevisions.status, 'submitted'),
            input.cursor ? gt(hostelRevisions.id, input.cursor) : undefined,
          ),
        )
        .orderBy(asc(hostelRevisions.id))
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      return hostelRevisionQueueSchema.parse({
        data: page.map((row) => ({ ...row, submittedAt: row.submittedAt?.toISOString() })),
        nextCursor: rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
      });
    });
  }
  read(actor: Actor, revisionId: unknown) {
    const target = id.parse(revisionId);
    return this.database.transaction(async (tx) => {
      await lockAdmin(tx, actor, 'verification', this.clock);
      return this.review(tx, target);
    });
  }
  decide(actor: Actor, key: unknown, revisionId: unknown, body: unknown) {
    const target = id.parse(revisionId),
      input = hostelRevisionDecisionSchema.parse(body);
    return this.idempotency
      .execute(
        { actor, key: id.parse(key), endpoint: 'POST hostel revision decision', status: 200 },
        { revision: target },
        input,
        hostelRevisionSchema,
        async (tx) => Boolean(await lockAdmin(tx, actor, 'verification', this.clock)),
        async () => this.apply(requireTransaction(), actor, target, input),
      )
      .catch(inventoryFailure);
  }
  private async apply(
    tx: Transaction,
    actor: Actor,
    revisionId: string,
    input: z.infer<typeof hostelRevisionDecisionSchema>,
  ) {
    const scope = await lockAdmin(tx, actor, 'verification', this.clock),
      now = this.clock();
    const [row] = await tx
      .select()
      .from(hostelRevisions)
      .where(eq(hostelRevisions.id, revisionId))
      .for('update');
    if (!row) throw new DomainError('NOT_FOUND', 404, 'Changes unavailable');
    if (row.status !== 'submitted')
      throw new DomainError('CONFLICT', 409, 'These changes are no longer waiting for review');
    requireVersion(row.version, input.expectedVersion);
    // Lock order matches setup: brand, then branch.
    await tx.select({ id: brands.id }).from(brands).where(eq(brands.id, row.brandId)).for('update');
    const [branch] = await tx
      .select({
        id: branches.id,
        status: branches.verificationStatus,
        org: branches.organizationId,
      })
      .from(branches)
      .where(and(eq(branches.id, row.branchId), eq(branches.brandId, row.brandId)))
      .for('update');
    if (!branch) throw new DomainError('NOT_FOUND', 404, 'Hostel unavailable');
    if (input.action === 'approve') await this.publish(tx, row, branch.status, now);
    const next = input.action === 'approve' ? 'approved' : 'rejected';
    await tx
      .update(hostelRevisions)
      .set({
        status: next,
        decidedAt: now,
        decidedByUserId: actor.userId,
        decisionNote: input.reason ?? null,
        version: row.version + 1,
        updatedAt: now,
      })
      .where(eq(hostelRevisions.id, row.id));
    const after = await this.revision(tx, row.id);
    await platformAudit(
      tx,
      scope,
      {
        action: 'hostel.revision.' + input.action,
        targetType: 'branch',
        targetId: row.branchId,
        before: { status: row.status, changes: row.changes },
        after: { status: next, reason: input.reason ?? null },
      },
      now,
    );
    const [org] = await tx
      .select({ ownerId: organizations.ownerUserId })
      .from(organizations)
      .where(eq(organizations.id, branch.org));
    if (org) await notify(tx, org.ownerId, 'owner.verification_updated', v7(), now);
    return after;
  }
  private async publish(
    tx: Transaction,
    row: typeof hostelRevisions.$inferSelect,
    status: string,
    now: Date,
  ) {
    if (status !== 'approved')
      throw new DomainError('CONFLICT', 409, 'The hostel is no longer approved; reject instead');
    const live = await readHostelSetup(tx, row.brandId);
    if (!live.mainBranch || live.mainBranch.id !== row.branchId)
      throw new DomainError('CONFLICT', 409, 'The hostel changed; reject instead');
    const changes = hostelRevisionChangesSchema.parse(row.changes),
      preview = previewBranch(live.mainBranch, changes);
    requireCompleteRevision(preview);
    await validateSetupGeography(tx, preview);
    if (changes.basics)
      await tx
        .update(brands)
        .set({
          name: changes.basics.name,
          updatedAt: now,
          ...(changes.basics.logoFileId !== undefined
            ? { logoFileId: changes.basics.logoFileId }
            : {}),
        })
        .where(eq(brands.id, row.brandId));
    await tx
      .update(branches)
      .set(mainBranchValues(preview, now))
      .where(and(eq(branches.id, row.branchId), eq(branches.brandId, row.brandId)));
  }
  private async revision(tx: Transaction, revisionId: string) {
    const [row] = await tx.select().from(hostelRevisions).where(eq(hostelRevisions.id, revisionId));
    if (!row) throw new DomainError('NOT_FOUND', 404, 'Changes unavailable');
    return projectRevision(row);
  }
  private async review(tx: Transaction, revisionId: string) {
    const revision = await this.revision(tx, revisionId);
    const [names] = await tx
      .select({ branchName: branches.name, organizationName: organizations.name })
      .from(branches)
      .innerJoin(organizations, eq(organizations.id, branches.organizationId))
      .where(eq(branches.id, revision.branchId));
    if (!names) throw new DomainError('NOT_FOUND', 404, 'Hostel unavailable');
    const live = await readHostelSetup(tx, revision.brandId);
    return hostelRevisionReviewSchema.parse({
      revision,
      ...names,
      live,
      placeNames: await placeNames(tx, [live.mainBranch, revision.changes.main]),
    });
  }
}
type PlaceIds = {
  cityId?: string | null | undefined;
  areaId?: string | null | undefined;
  subAreaId?: string | null | undefined;
};
// CHG-041: names for the live and proposed city/area/sub-area, so the Admin sees "G-10" not a uuid.
async function placeNames(tx: Transaction, rows: (PlaceIds | null | undefined)[]) {
  const ids = [
    ...new Set(rows.flatMap((row) => [row?.cityId, row?.areaId, row?.subAreaId])),
  ].filter((value): value is string => typeof value === 'string');
  if (!ids.length) return {};
  const [cityRows, areaRows] = await Promise.all([
    tx.select({ id: cities.id, name: cities.name }).from(cities).where(inArray(cities.id, ids)),
    tx.select({ id: areas.id, name: areas.name }).from(areas).where(inArray(areas.id, ids)),
  ]);
  return Object.fromEntries([...cityRows, ...areaRows].map((row) => [row.id, row.name]));
}
