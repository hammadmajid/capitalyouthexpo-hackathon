import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { complaintAttachments, complaintEvents, complaints, type Database } from '@hsm/db';
import {
  DomainError,
  type InventoryPermission,
  complaintDetailSchema,
  complaintInputSchema,
  complaintPageSchema,
  complaintQuerySchema,
  complaintResidentActionSchema,
  complaintStaffActionSchema,
  complaintStatsSchema,
  complaintStatusSchema,
  downloadResponseSchema,
  nextComplaintStatus,
  stayIdentifierSchema,
} from '@hsm/contracts';
import type { PrivateStorage } from '@hsm/files';
import type { Actor } from '../authorization/store.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { requireTransaction } from '../idempotency/context.js';
import type { IdempotencyService } from '../idempotency/service.js';
import { inventoryFailure } from '../booking/errors.js';
import { lockOwnStay, lockStaffScope, type StaffScope, replayAuthorizer } from './scope.js';
import { branchOwner, notify } from './notify.js';
import { ComplaintRepository } from './complaints.repository.js';
const id = stayIdentifierSchema;
type Complaint = typeof complaints.$inferSelect;
type Move = Parameters<typeof nextComplaintStatus>[1];
function conflict(message: string): never {
  throw new DomainError('CONFLICT', 409, message);
}
// CMP-001..006: residents raise and close complaints on their own active Stay; staff in the
// branch (stay_manage to act) assign, progress and resolve. Every move is history + audit.
export class ComplaintService {
  constructor(
    private readonly database: Database,
    private readonly idempotency: IdempotencyService,
    private readonly storage: Pick<PrivateStorage, 'presignDownload'>,
    private readonly bucket: string,
    private readonly clock: () => Date = () => new Date(),
    private readonly repository = new ComplaintRepository(),
    private readonly audit = new AuditWriter(),
  ) {}
  create(actor: Actor, key: unknown, stayId: unknown, body: unknown) {
    const stay = id.parse(stayId),
      input = complaintInputSchema.parse(body);
    return this.command(actor, key, 'POST complaint', 201, { stay }, input, async (tx) => {
      const own = await lockOwnStay(tx, actor, stay, this.clock, true);
      await this.repository.requireAttachments(
        tx,
        actor.userId,
        this.bucket,
        input.attachmentFileIds,
      );
      const now = this.clock();
      const [row] = await tx
        .insert(complaints)
        .values({
          branchId: own.stay.branchId,
          stayId: stay,
          userId: actor.userId,
          roomId: own.place?.roomId ?? null,
          seatId: own.place?.seatId ?? null,
          category: input.category,
          title: input.title,
          description: input.description,
          status: 'open',
          version: 1,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!row) throw new DomainError('INTERNAL', 500, 'Complaint unavailable');
      if (input.attachmentFileIds.length)
        await tx.insert(complaintAttachments).values(
          input.attachmentFileIds.map((fileId) => ({
            complaintId: row.id,
            fileId,
            createdAt: now,
          })),
        );
      const [event] = await tx
        .insert(complaintEvents)
        .values({
          complaintId: row.id,
          actorUserId: actor.userId,
          actorRole: 'resident',
          fromStatus: null,
          toStatus: 'open',
          createdAt: now,
        })
        .returning({ id: complaintEvents.id });
      const owner = await branchOwner(tx, row.branchId);
      if (owner && event) await notify(tx, owner, 'resident.complaint_submitted', event.id, now);
      return this.repository.detail(tx, row.id);
    });
  }
  ownPage(actor: Actor, stayId: unknown, query: unknown) {
    const stay = id.parse(stayId),
      input = complaintQuerySchema.parse(query);
    return this.database.transaction(async (tx) => {
      await lockOwnStay(tx, actor, stay, this.clock, false);
      return complaintPageSchema.parse(
        await this.repository.page(
          tx,
          { stayId: stay, status: input.status, category: input.category },
          input.cursor,
          input.limit,
        ),
      );
    });
  }
  ownDetail(actor: Actor, stayId: unknown, complaintId: unknown) {
    const stay = id.parse(stayId),
      complaint = id.parse(complaintId);
    return this.database.transaction(async (tx) => {
      await lockOwnStay(tx, actor, stay, this.clock, false);
      const detail = await this.repository.detail(tx, complaint);
      if (detail.stayId !== stay) throw new DomainError('NOT_FOUND', 404, 'Complaint unavailable');
      return detail;
    });
  }
  // CMP-004: the resident accepts a resolution (closed) or reopens it while still resident.
  residentAct(actor: Actor, key: unknown, stayId: unknown, complaintId: unknown, body: unknown) {
    const stay = id.parse(stayId),
      complaint = id.parse(complaintId),
      input = complaintResidentActionSchema.parse(body);
    return this.command(
      actor,
      key,
      'POST complaint resident action',
      200,
      { stay, complaint },
      input,
      async (tx) => {
        await lockOwnStay(tx, actor, stay, this.clock, input.action === 'reopen');
        const row = await this.lockComplaint(tx, complaint, input.expectedVersion);
        if (row.stayId !== stay || row.userId !== actor.userId)
          throw new DomainError('NOT_FOUND', 404, 'Complaint unavailable');
        const note = input.action === 'reopen' ? input.note : null;
        const eventId = await this.move(tx, row, input.action, {
          actorRole: 'resident',
          userId: actor.userId,
          note,
        });
        if (input.action === 'reopen') {
          const owner = await branchOwner(tx, row.branchId);
          if (owner) await notify(tx, owner, 'resident.complaint_reopened', eventId, this.clock());
        }
        return this.repository.detail(tx, row.id);
      },
    );
  }
  staffPage(actor: Actor, branchId: unknown, query: unknown) {
    const branch = id.parse(branchId),
      input = complaintQuerySchema.parse(query);
    return this.database.transaction(async (tx) => {
      await lockStaffScope(tx, actor, branch, [], this.clock);
      return complaintPageSchema.parse(
        await this.repository.page(
          tx,
          { branchId: branch, status: input.status, category: input.category },
          input.cursor,
          input.limit,
        ),
      );
    });
  }
  staffDetail(actor: Actor, branchId: unknown, complaintId: unknown) {
    const branch = id.parse(branchId),
      complaint = id.parse(complaintId);
    return this.database.transaction(async (tx) => {
      await lockStaffScope(tx, actor, branch, [], this.clock);
      const detail = await this.repository.detail(tx, complaint);
      if (detail.branchId !== branch)
        throw new DomainError('NOT_FOUND', 404, 'Complaint unavailable');
      return detail;
    });
  }
  staffAct(actor: Actor, key: unknown, branchId: unknown, complaintId: unknown, body: unknown) {
    const branch = id.parse(branchId),
      complaint = id.parse(complaintId),
      input = complaintStaffActionSchema.parse(body);
    return this.command(
      actor,
      key,
      'POST complaint staff action',
      200,
      { branch, complaint },
      input,
      async (tx) => {
        const scope = await lockStaffScope(tx, actor, branch, ['stay_manage'], this.clock);
        const row = await this.lockComplaint(tx, complaint, input.expectedVersion);
        if (row.branchId !== branch)
          throw new DomainError('NOT_FOUND', 404, 'Complaint unavailable');
        if (input.action === 'assign') {
          const owner = await branchOwner(tx, branch);
          if (!owner) throw new DomainError('INTERNAL', 500, 'Branch owner unavailable');
          await this.repository.requireAssignee(tx, branch, owner, input.assigneeUserId);
        }
        const note = 'note' in input ? input.note : null;
        const eventId = await this.move(tx, row, input.action, {
          actorRole: scope.actorRole,
          userId: actor.userId,
          note,
          assigneeUserId: input.action === 'assign' ? input.assigneeUserId : undefined,
        });
        await this.record(tx, scope, row, input.action, eventId);
        if (input.action !== 'note')
          await notify(tx, row.userId, 'resident.complaint_updated', eventId, this.clock());
        return this.repository.detail(tx, row.id);
      },
      ['stay_manage'],
    );
  }
  // CMP-005: counts by status and average hours from report to resolution in the branch.
  stats(actor: Actor, branchId: unknown) {
    const branch = id.parse(branchId);
    return this.database.transaction(async (tx) => {
      await lockStaffScope(tx, actor, branch, [], this.clock);
      const counts = await tx
        .select({ status: complaints.status, count: sql<number>`count(*)::int` })
        .from(complaints)
        .where(eq(complaints.branchId, branch))
        .groupBy(complaints.status);
      const [resolved] = await tx
        .select({
          count: sql<number>`count(*)::int`,
          hours: sql<
            number | null
          >`avg(extract(epoch from (${complaints.resolvedAt} - ${complaints.createdAt})) / 3600)::float8`,
        })
        .from(complaints)
        .where(
          and(
            eq(complaints.branchId, branch),
            isNotNull(complaints.resolvedAt),
            inArray(complaints.status, ['resolved', 'closed']),
          ),
        );
      return complaintStatsSchema.parse({
        branchId: branch,
        counts: Object.fromEntries(
          complaintStatusSchema.options.map((status) => [
            status,
            counts.find((row) => row.status === status)?.count ?? 0,
          ]),
        ),
        resolvedCount: resolved?.count ?? 0,
        averageResolutionHours:
          resolved?.hours === null || resolved?.hours === undefined
            ? null
            : Math.round(resolved.hours * 10) / 10,
      });
    });
  }
  // CMP-003 / SEC-003: short-lived link for the complaint's own resident or branch staff.
  attachment(
    actor: Actor,
    complaintId: unknown,
    fileId: unknown,
    scope: { stayId?: unknown; branchId?: unknown },
  ) {
    const complaint = id.parse(complaintId),
      file = id.parse(fileId);
    return this.database.transaction(async (tx) => {
      const detail = await this.authorizeRead(tx, actor, complaint, scope);
      const row = await this.repository.attachmentFile(tx, complaint, file, this.bucket);
      await this.audit.sensitive(tx, {
        actorUserId: actor.userId,
        subjectUserId: detail.userId,
        resource: 'private_document',
        resourceId: row.id,
        purpose: 'Resident complaint attachment',
        createdAt: this.clock(),
      });
      let url: string;
      try {
        url = await this.storage.presignDownload(row.objectKey, row.id, row.mimeType);
      } catch {
        throw new DomainError('INTERNAL', 503, 'Storage unavailable');
      }
      return downloadResponseSchema.parse({
        url,
        expiresAt: new Date(this.clock().getTime() + 60000).toISOString(),
      });
    });
  }
  private async authorizeRead(
    tx: Transaction,
    actor: Actor,
    complaint: string,
    scope: { stayId?: unknown; branchId?: unknown },
  ) {
    const [row] = await tx.select().from(complaints).where(eq(complaints.id, complaint));
    if (!row) throw new DomainError('NOT_FOUND', 404, 'Complaint unavailable');
    if (scope.branchId !== undefined) {
      const branch = id.parse(scope.branchId);
      await lockStaffScope(tx, actor, branch, [], this.clock);
      if (row.branchId !== branch) throw new DomainError('NOT_FOUND', 404, 'Complaint unavailable');
    } else {
      const stay = id.parse(scope.stayId);
      await lockOwnStay(tx, actor, stay, this.clock, false);
      if (row.stayId !== stay) throw new DomainError('NOT_FOUND', 404, 'Complaint unavailable');
    }
    return row;
  }
  private async lockComplaint(tx: Transaction, complaint: string, expectedVersion: number) {
    const [row] = await tx
      .select()
      .from(complaints)
      .where(eq(complaints.id, complaint))
      .for('update');
    if (!row) throw new DomainError('NOT_FOUND', 404, 'Complaint unavailable');
    if (row.version !== expectedVersion)
      conflict('This complaint changed; reload before continuing');
    return row;
  }
  private async move(
    tx: Transaction,
    row: Complaint,
    action: Move,
    by: {
      actorRole: 'resident' | 'owner' | 'manager';
      userId: string;
      note: string | null;
      assigneeUserId?: string | undefined;
    },
  ) {
    const next = nextComplaintStatus(row.status, action);
    if (!next) conflict('That step is not available for this complaint now');
    const now = this.clock();
    await tx
      .update(complaints)
      .set({
        status: next,
        version: row.version + 1,
        updatedAt: now,
        ...(by.assigneeUserId ? { assignedToUserId: by.assigneeUserId } : {}),
        ...(next === 'resolved' ? { resolvedAt: now } : {}),
        ...(next === 'closed' ? { closedAt: now } : {}),
        ...(action === 'reopen' ? { reopenCount: row.reopenCount + 1 } : {}),
      })
      .where(eq(complaints.id, row.id));
    const [event] = await tx
      .insert(complaintEvents)
      .values({
        complaintId: row.id,
        actorUserId: by.userId,
        actorRole: by.actorRole,
        fromStatus: row.status,
        toStatus: next,
        note: by.note,
        assignedToUserId: by.assigneeUserId ?? null,
        createdAt: now,
      })
      .returning({ id: complaintEvents.id });
    if (!event) throw new DomainError('INTERNAL', 500, 'Complaint history unavailable');
    return event.id;
  }
  private async record(
    tx: Transaction,
    scope: StaffScope,
    row: Complaint,
    action: string,
    eventId: string,
  ) {
    await this.audit.hostel(tx, {
      organizationId: scope.organizationId,
      branchId: row.branchId,
      actorUserId: scope.actorUserId,
      actorRole: scope.actorRole,
      action: 'complaint.' + action,
      targetType: 'complaint',
      targetId: row.id,
      before: { status: row.status, version: row.version },
      after: { eventId },
      createdAt: this.clock(),
    });
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
        complaintDetailSchema,
        replayAuthorizer(actor, this.clock, scope, grants),
        async () => work(requireTransaction()),
      )
      .catch(inventoryFailure);
  }
}
