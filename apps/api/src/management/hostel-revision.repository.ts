import { and, desc, eq, inArray } from 'drizzle-orm';
import { v7 } from 'uuid';
import { hostelRevisions, type Database } from '@hsm/db';
import {
  DomainError,
  hostelRevisionChangesSchema,
  hostelRevisionSchema,
  hostelRevisionStateSchema,
  type HostelRevisionChanges,
  type SaveHostelRevision,
} from '@hsm/contracts';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import type { Actor } from '../authorization/store.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockSetupScope, requireSetupFile } from './hostel-setup.scope.js';
import { readHostelSetup, validateSetupGeography } from './hostel-setup.projection.js';
import {
  mergeChanges,
  previewBranch,
  requireCompleteRevision,
  requireRevisable,
  requireVersion,
} from './hostel-revision.policy.js';
type Row = typeof hostelRevisions.$inferSelect;
export function projectRevision(row: Row) {
  return hostelRevisionSchema.parse({
    id: row.id,
    brandId: row.brandId,
    branchId: row.branchId,
    status: row.status,
    changes: hostelRevisionChangesSchema.parse(row.changes),
    version: row.version,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decisionNote: row.decisionNote,
    updatedAt: row.updatedAt.toISOString(),
  });
}
export async function openRevision(tx: Transaction, branchId: string) {
  const [row] = await tx
    .select()
    .from(hostelRevisions)
    .where(
      and(
        eq(hostelRevisions.branchId, branchId),
        inArray(hostelRevisions.status, ['draft', 'submitted']),
      ),
    )
    .for('update');
  return row;
}
// CHG-041: Owner side of re-verification. The live hostel is never written here.
export class HostelRevisionRepository {
  constructor(
    private readonly database: Database,
    private readonly bucket: string,
    private readonly audit = new AuditWriter(),
    private readonly clock: () => Date = () => new Date(),
  ) {}
  read(actor: Actor, brandId: string) {
    return this.database.transaction(async (tx) => {
      await lockActor(tx, actor, this.clock);
      await lockSetupScope(tx, actor, { kind: 'brand', id: brandId });
      return this.state(tx, brandId);
    });
  }
  async save(tx: Transaction, actor: Actor, brandId: string, input: SaveHostelRevision, now: Date) {
    const live = await readHostelSetup(tx, brandId);
    requireRevisable(live.mainBranch);
    const current = await openRevision(tx, live.mainBranch.id);
    if (current?.status === 'submitted')
      throw new DomainError(
        'CONFLICT',
        409,
        'These changes are waiting for review. Withdraw them to edit again.',
      );
    requireVersion(current?.version ?? null, input.expectedVersion);
    const changes = mergeChanges(
      current ? hostelRevisionChangesSchema.parse(current.changes) : null,
      input,
    );
    await this.validate(tx, actor, live.mainBranch, changes);
    if (current)
      await tx
        .update(hostelRevisions)
        .set({ changes, version: current.version + 1, updatedAt: now })
        .where(eq(hostelRevisions.id, current.id));
    else
      await tx.insert(hostelRevisions).values({
        id: v7(),
        brandId,
        branchId: live.mainBranch.id,
        changes,
        createdByUserId: actor.userId,
        createdAt: now,
        updatedAt: now,
      });
    return this.record(tx, actor, brandId, 'hostel.revision.saved', now);
  }
  async submit(tx: Transaction, actor: Actor, brandId: string, version: number, now: Date) {
    const live = await readHostelSetup(tx, brandId);
    requireRevisable(live.mainBranch);
    const current = await openRevision(tx, live.mainBranch.id);
    if (!current || current.status !== 'draft')
      throw new DomainError('CONFLICT', 409, 'There are no unsent changes');
    requireVersion(current.version, version);
    const changes = hostelRevisionChangesSchema.parse(current.changes);
    await this.validate(tx, actor, live.mainBranch, changes);
    requireCompleteRevision(previewBranch(live.mainBranch, changes));
    await tx
      .update(hostelRevisions)
      .set({ status: 'submitted', submittedAt: now, version: current.version + 1, updatedAt: now })
      .where(eq(hostelRevisions.id, current.id));
    return this.record(tx, actor, brandId, 'hostel.revision.submitted', now);
  }
  async withdraw(tx: Transaction, actor: Actor, brandId: string, version: number, now: Date) {
    const live = await readHostelSetup(tx, brandId);
    requireRevisable(live.mainBranch);
    const current = await openRevision(tx, live.mainBranch.id);
    if (!current) throw new DomainError('CONFLICT', 409, 'There are no pending changes');
    requireVersion(current.version, version);
    await tx
      .update(hostelRevisions)
      .set({ status: 'cancelled', version: current.version + 1, updatedAt: now })
      .where(eq(hostelRevisions.id, current.id));
    return this.record(tx, actor, brandId, 'hostel.revision.withdrawn', now);
  }
  private async validate(
    tx: Transaction,
    actor: Actor,
    live: Parameters<typeof previewBranch>[0],
    changes: HostelRevisionChanges,
  ) {
    if (changes.basics?.logoFileId)
      await requireSetupFile(tx, actor, this.bucket, changes.basics.logoFileId, 'listing_photo');
    await validateSetupGeography(tx, previewBranch(live, changes));
  }
  async state(tx: Transaction, brandId: string) {
    const live = await readHostelSetup(tx, brandId);
    const [latest] = live.mainBranch
      ? await tx
          .select()
          .from(hostelRevisions)
          .where(eq(hostelRevisions.branchId, live.mainBranch.id))
          .orderBy(desc(hostelRevisions.createdAt), desc(hostelRevisions.id))
          .limit(1)
      : [];
    return hostelRevisionStateSchema.parse({
      live,
      revision: latest && latest.status !== 'cancelled' ? projectRevision(latest) : null,
    });
  }
  private async record(tx: Transaction, actor: Actor, brandId: string, action: string, now: Date) {
    const state = await this.state(tx, brandId);
    await this.audit.hostel(tx, {
      actorUserId: actor.userId,
      actorRole: 'owner',
      action,
      targetType: 'brand',
      targetId: brandId,
      organizationId: state.live.organizationId,
      branchId: state.live.mainBranch?.id ?? null,
      after: state.revision,
      createdAt: now,
    });
    return state;
  }
}
