import { and, eq, inArray, ne } from 'drizzle-orm';
import { v7 } from 'uuid';
import {
  enqueueVisitLifecycle,
  visitHistory,
  visitRequests,
  visitingHours,
  type Database,
} from '@hsm/db';
import {
  DomainError,
  visitSlotsSchema,
  planVisitTransition,
  requireFutureVisitStart,
  type SaveVisitingHours,
  type VisitInterestInput,
  type VisitActionInput,
  type VisitListQuery,
} from '@hsm/contracts';
import { lockActor } from '../auth/actor-lock.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import type { Actor } from '../authorization/store.js';
import {
  authorizeVisitBranch,
  authorizeVisitCustomer,
  lockVisit,
  lockVisitListing,
  publicVisitBranchId,
} from './access.js';
import { projectVisit, readVisitHours, readVisitPage } from './state.js';
import { readVisitHistory } from './history.js';
import { readVisitInterest, recordVisitInterest } from './interest.js';
export class VisitRepository {
  constructor(
    readonly database: Database,
    private readonly audit = new AuditWriter(),
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async authorize(tx: Transaction, actor: Actor, branchId?: string, visitId?: string) {
    if (branchId) await authorizeVisitBranch(tx, actor, branchId, this.clock);
    else await authorizeVisitCustomer(tx, actor, this.clock);
    if (visitId)
      await lockVisit(tx, visitId, branchId ? { branchId } : { customerUserId: actor.userId });
    await lockActor(tx, actor, this.clock);
    return true;
  }
  hours(actor: Actor, branchId: string) {
    return this.database.transaction(async (tx) => {
      await this.authorize(tx, actor, branchId);
      return readVisitHours(tx, branchId);
    });
  }
  publicHours(slug: string, date: string) {
    return this.database.transaction(async (tx) => {
      const hours = await readVisitHours(tx, await publicVisitBranchId(tx, slug));
      const day = new Date(date + 'T00:00:00Z').getUTCDay();
      return visitSlotsSchema.parse({
        branchId: hours.branchId,
        date,
        windows: hours.windows.filter((window) => window.dayOfWeek === day),
      });
    });
  }
  list(actor: Actor, query: VisitListQuery, branchId?: string) {
    return this.database.transaction(async (tx) => {
      await this.authorize(tx, actor, branchId);
      return readVisitPage(tx, branchId ? { branchId } : { customerUserId: actor.userId }, query);
    });
  }
  historyPage(
    actor: Actor,
    visitId: string,
    query: { limit: number; cursor?: string | undefined },
    branchId?: string,
  ) {
    return this.database.transaction(async (tx) => {
      await this.authorize(tx, actor, branchId);
      const visit = await lockVisit(
        tx,
        visitId,
        branchId ? { branchId } : { customerUserId: actor.userId },
      );
      await lockActor(tx, actor, this.clock);
      return readVisitHistory(tx, visit, query);
    });
  }
  interest(actor: Actor, visitId: string, branchId?: string) {
    return this.database.transaction(async (tx) => {
      await this.authorize(tx, actor, branchId);
      const visit = await lockVisit(
        tx,
        visitId,
        branchId ? { branchId } : { customerUserId: actor.userId },
      );
      await lockActor(tx, actor, this.clock);
      return readVisitInterest(tx, visit);
    });
  }
  async recordInterest(tx: Transaction, actor: Actor, visitId: string, input: VisitInterestInput) {
    const visit = await lockVisit(tx, visitId, { customerUserId: actor.userId });
    await lockActor(tx, actor, this.clock);
    return recordVisitInterest(tx, visit, input, this.clock());
  }
  async saveHours(tx: Transaction, actor: Actor, branchId: string, input: SaveVisitingHours) {
    const scope = await authorizeVisitBranch(tx, actor, branchId, this.clock),
      before = await readVisitHours(tx, branchId);
    if (before.version !== input.expectedVersion)
      throw new DomainError(
        'PRECONDITION_FAILED',
        412,
        'Visiting hours changed; reload before saving',
      );
    await tx.delete(visitingHours).where(eq(visitingHours.branchId, branchId));
    if (input.windows.length)
      await tx
        .insert(visitingHours)
        .values(input.windows.map((window) => ({ ...window, branchId })));
    const after = await readVisitHours(tx, branchId);
    await this.audit.hostel(tx, {
      actorUserId: actor.userId,
      actorRole: scope.actorRole,
      organizationId: scope.organizationId,
      branchId,
      action: 'visit.hours.changed',
      targetType: 'branch',
      targetId: branchId,
      before,
      after,
      createdAt: this.clock(),
    });
    return after;
  }
  async create(tx: Transaction, actor: Actor, branchId: string, requestedStart: string) {
    await lockVisitListing(tx, branchId);
    await lockActor(tx, actor, this.clock);
    const hours = await readVisitHours(tx, branchId),
      now = this.clock();
    requireFutureVisitStart(requestedStart, hours.windows, now.toISOString());
    const [duplicate] = await tx
      .select({ id: visitRequests.id })
      .from(visitRequests)
      .where(
        and(
          eq(visitRequests.branchId, branchId),
          eq(visitRequests.customerUserId, actor.userId),
          eq(visitRequests.requestedStart, new Date(requestedStart)),
          inArray(visitRequests.status, ['requested', 'approved', 'rescheduled']),
        ),
      )
      .limit(1);
    if (duplicate)
      throw new DomainError('CONFLICT', 409, 'An active visit already exists for that time');
    const [row] = await tx
      .insert(visitRequests)
      .values({
        id: v7(),
        branchId,
        customerUserId: actor.userId,
        requestedStart: new Date(requestedStart),
        status: 'requested',
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!row) throw new Error('Visit write unavailable');
    await this.history(tx, actor, row, 'request', null, now);
    return projectVisit(row);
  }
  async action(
    tx: Transaction,
    actor: Actor,
    visitId: string,
    input: VisitActionInput,
    branchId?: string,
  ) {
    const before = await lockVisit(
      tx,
      visitId,
      branchId ? { branchId } : { customerUserId: actor.userId },
    );
    await lockActor(tx, actor, this.clock);
    if (before.updatedAt.toISOString() !== input.expectedUpdatedAt)
      throw new DomainError('PRECONDITION_FAILED', 412, 'Visit changed; reload before acting');
    const action = input.command.action;
    if (
      branchId
        ? ['cancel', 'accept-reschedule'].includes(action)
        : !['cancel', 'accept-reschedule'].includes(action)
    )
      throw new DomainError('FORBIDDEN', 403, 'Visit action is unavailable in this context');
    const hours = await readVisitHours(tx, before.branchId),
      now = this.clock();
    const timing = planVisitTransition(
      {
        status: before.status,
        requestedStart: before.requestedStart.toISOString(),
        proposedStart: before.proposedStart?.toISOString() ?? null,
      },
      input.command,
      hours.windows,
      now.toISOString(),
    );
    if (action === 'accept-reschedule') {
      const [conflict] = await tx
        .select({ id: visitRequests.id })
        .from(visitRequests)
        .where(
          and(
            eq(visitRequests.branchId, before.branchId),
            eq(visitRequests.customerUserId, before.customerUserId),
            ne(visitRequests.id, before.id),
            eq(visitRequests.requestedStart, new Date(timing.requestedStart)),
            inArray(visitRequests.status, ['requested', 'approved', 'rescheduled']),
          ),
        )
        .limit(1);
      if (conflict)
        throw new DomainError('CONFLICT', 409, 'An active visit already exists for that time');
    }
    const reason =
      'reason' in input.command
        ? input.command.reason
        : 'note' in input.command
          ? (input.command.note ?? null)
          : null;
    const updatedAt = new Date(Math.max(now.getTime(), before.updatedAt.getTime() + 1));
    const [row] = await tx
      .update(visitRequests)
      .set({
        ...timing,
        requestedStart: new Date(timing.requestedStart),
        proposedStart: timing.proposedStart ? new Date(timing.proposedStart) : null,
        decidedByUserId: branchId ? actor.userId : before.decidedByUserId,
        reason,
        updatedAt,
      })
      .where(and(eq(visitRequests.id, visitId), eq(visitRequests.branchId, before.branchId)))
      .returning();
    if (!row) throw new Error('Visit transition unavailable');
    await this.history(tx, actor, row, action, reason, now);
    if (branchId) {
      const scope = await authorizeVisitBranch(tx, actor, branchId, this.clock);
      await this.audit.hostel(tx, {
        actorUserId: actor.userId,
        actorRole: scope.actorRole,
        organizationId: scope.organizationId,
        branchId,
        action: 'visit.' + action,
        targetType: 'visit',
        targetId: visitId,
        before: projectVisit(before),
        after: projectVisit(row),
        createdAt: now,
      });
    }
    return projectVisit(row);
  }
  private async history(
    tx: Transaction,
    actor: Actor,
    row: typeof visitRequests.$inferSelect,
    action: string,
    reason: string | null,
    now: Date,
  ) {
    const historyId = v7();
    await tx.insert(visitHistory).values({
      id: historyId,
      branchId: row.branchId,
      visitId: row.id,
      actorUserId: actor.userId,
      action,
      status: row.status,
      requestedStart: row.requestedStart,
      proposedStart: row.proposedStart,
      reason,
      createdAt: now,
    });
    await enqueueVisitLifecycle(tx, { event: 'visit.changed', visitId: row.id, historyId }, now);
  }
}
