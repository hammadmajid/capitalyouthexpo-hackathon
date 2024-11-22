import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import { residentAccountLinks as requests, residents, stays, users, type Database } from '@hsm/db';
import { DomainError, residentAccountLinkPageSchema } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockParticipants } from '../management/identity-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
import {
  activeOfflineStay,
  hasLinkedStay,
  linkIdentity,
  lockedOfflineStay,
} from './account-link-match.js';
import { writeAccountLink } from './account-link-write.js';

function pending() {
  return and(
    eq(requests.status, 'pending'),
    activeOfflineStay(),
    eq(requests.matchedPhone, residents.phone),
    eq(requests.matchedPhone, users.phoneE164),
    eq(users.accountStatus, 'active'),
  );
}
export async function readAccountLinkRequests(
  database: Database,
  actor: Actor,
  branchId: string,
  cursor: string | undefined,
  clock: () => Date,
) {
  return database.transaction(async (tx) => {
    await lockActor(tx, actor, clock);
    await lockInventoryScope(tx, actor, branchId, 'stay_manage');
    const rows = await tx
      .select({
        id: requests.id,
        residentId: residents.id,
        residentName: residents.displayName,
        customerName: users.fullName,
        phone: requests.matchedPhone,
        createdAt: requests.createdAt,
      })
      .from(requests)
      .innerJoin(stays, eq(stays.id, requests.stayId))
      .innerJoin(residents, eq(residents.id, stays.residentId))
      .innerJoin(users, eq(users.id, requests.userId))
      .where(
        and(
          eq(requests.branchId, branchId),
          pending(),
          cursor ? gt(requests.id, cursor) : undefined,
        ),
      )
      .orderBy(asc(requests.id))
      .limit(51);
    const data = rows
      .slice(0, 50)
      .map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
    return residentAccountLinkPageSchema.parse({
      data,
      nextCursor: rows.length > 50 ? data.at(-1)?.id : null,
    });
  });
}
async function approvalTarget(
  tx: Transaction,
  request: typeof requests.$inferSelect,
  user: Awaited<ReturnType<typeof linkIdentity>>,
) {
  const target = await lockedOfflineStay(tx, request.branchId, request.stayId);
  if (!target || !user || user.status !== 'active' || !user.emailVerifiedAt) return;
  if (user.phone !== request.matchedPhone || target.resident.phone !== request.matchedPhone) return;
  if (await hasLinkedStay(tx, request.userId, request.branchId)) return;
  return target;
}
export async function decideAccountLink(
  database: Database,
  actor: Actor,
  branchId: string,
  requestId: string,
  action: 'approve' | 'reject',
  clock: () => Date,
) {
  const result = await database.transaction(async (tx) => {
    // Lock the claimant before the hierarchy, matching profile-save lock order.
    const [candidate] = await tx
      .select()
      .from(requests)
      .where(and(eq(requests.id, requestId), eq(requests.branchId, branchId)));
    if (candidate) await lockParticipants(tx, actor, candidate.userId, clock);
    else await lockActor(tx, actor, clock);
    const user = candidate ? await linkIdentity(tx, candidate.userId) : undefined;
    const scope = await lockInventoryScope(tx, actor, branchId, 'stay_manage');
    const [request] = await tx
      .select()
      .from(requests)
      .where(and(eq(requests.id, requestId), eq(requests.branchId, branchId)))
      .for('update');
    if (!request) throw new DomainError('NOT_FOUND', 404, 'Request unavailable');
    if (request.status !== 'pending')
      return request.status === (action === 'approve' ? 'approved' : 'rejected');
    const target = await approvalTarget(tx, request, user);
    const now = clock();
    const audit = {
      actorUserId: actor.userId,
      actorRole: scope.actorRole,
      organizationId: scope.organizationId,
    };
    if (target && action === 'approve')
      await writeAccountLink(tx, target, request.userId, audit, 'hostel_approval', now);
    const status = !target ? 'expired' : action === 'approve' ? 'approved' : 'rejected';
    await tx
      .update(requests)
      .set({ status, decidedAt: now, decidedByUserId: actor.userId })
      .where(eq(requests.id, requestId));
    await new AuditWriter().hostel(tx, {
      ...audit,
      branchId,
      action: 'resident.account_link.' + status,
      targetType: 'resident_account_link',
      targetId: requestId,
      after: { status },
      createdAt: now,
    });
    return Boolean(target);
  });
  if (!result)
    throw new DomainError('CONFLICT', 409, 'Request is no longer available. Refresh residents.');
  return { success: true };
}

export async function ownAccountLinkStatus(database: Database, actor: Actor, clock: () => Date) {
  return database.transaction(async (tx) => {
    await lockActor(tx, actor, clock);
    const [row] = await tx
      .select({ id: requests.id })
      .from(requests)
      .innerJoin(stays, eq(stays.id, requests.stayId))
      .innerJoin(residents, eq(residents.id, stays.residentId))
      .innerJoin(users, eq(users.id, requests.userId))
      .where(and(eq(requests.userId, actor.userId), pending(), isNull(residents.archivedAt)))
      .limit(1);
    return { pending: Boolean(row) };
  });
}
