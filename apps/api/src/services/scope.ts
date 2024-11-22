import { and, eq, isNull } from 'drizzle-orm';
import {
  managerAssignments,
  managerInventoryGrants,
  rooms,
  seats,
  stayAssignments,
  stays,
} from '@hsm/db';
import { DomainError, type InventoryPermission } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
export type StaffScope = {
  organizationId: string;
  branchId: string;
  actorUserId: string;
  actorRole: 'owner' | 'manager';
};
// SEC-001 / CHG-010: live Owner or active Manager holding every listed grant in this exact branch.
export async function lockStaffScope(
  tx: Transaction,
  actor: Actor,
  branchId: string,
  grants: readonly InventoryPermission[],
  clock: () => Date,
): Promise<StaffScope> {
  await lockActor(tx, actor, clock);
  let scope = await lockInventoryScope(tx, actor, branchId, grants[0]);
  for (const grant of grants.slice(1)) scope = await lockInventoryScope(tx, actor, branchId, grant);
  await lockActor(tx, actor, clock);
  return {
    organizationId: scope.organizationId,
    branchId,
    actorUserId: actor.userId,
    actorRole: scope.actorRole === 'owner' ? 'owner' : 'manager',
  };
}
// The caller holds the assignment lock through lockStaffScope.
export async function canReadBranchFinance(tx: Transaction, scope: StaffScope) {
  if (scope.actorRole === 'owner') return true;
  const [grant] = await tx
    .select({ id: managerAssignments.id })
    .from(managerAssignments)
    .innerJoin(
      managerInventoryGrants,
      eq(managerInventoryGrants.assignmentId, managerAssignments.id),
    )
    .where(
      and(
        eq(managerAssignments.branchId, scope.branchId),
        eq(managerAssignments.userId, scope.actorUserId),
        eq(managerAssignments.status, 'active'),
        eq(managerInventoryGrants.permission, 'finance_view'),
      ),
    );
  return grant !== undefined;
}
// True when the Owner, or an active Manager holding every listed grant in this branch.
export async function holdsGrants(
  tx: Transaction,
  scope: StaffScope,
  grants: readonly InventoryPermission[],
) {
  if (scope.actorRole === 'owner') return true;
  const rows = await tx
    .select({ permission: managerInventoryGrants.permission })
    .from(managerAssignments)
    .innerJoin(
      managerInventoryGrants,
      eq(managerInventoryGrants.assignmentId, managerAssignments.id),
    )
    .where(
      and(
        eq(managerAssignments.branchId, scope.branchId),
        eq(managerAssignments.userId, scope.actorUserId),
        eq(managerAssignments.status, 'active'),
      ),
    );
  const held = new Set<string>(rows.map((row) => row.permission));
  return grants.every((grant) => held.has(grant));
}
export const OPERATIONAL_STAY_STATES = ['active', 'notice_given', 'checkout_pending'] as const;
// CMP-001 / CMP-006: the caller's own linked Stay; `operational` requires it to be checked in
// and not closed. The current room/bed comes from the open assignment, never the client.
export async function lockOwnStay(
  tx: Transaction,
  actor: Actor,
  stayId: string,
  clock: () => Date,
  operational: boolean,
) {
  await lockActor(tx, actor, clock);
  const [stay] = await tx
    .select()
    .from(stays)
    .where(and(eq(stays.id, stayId), eq(stays.userId, actor.userId)))
    .for('update');
  if (!stay) throw new DomainError('NOT_FOUND', 404, 'Stay unavailable');
  if (operational && !OPERATIONAL_STAY_STATES.some((state) => state === stay.state))
    throw new DomainError('FORBIDDEN', 403, 'This Stay is not active');
  const [place] = await tx
    .select({
      roomId: stayAssignments.roomId,
      seatId: stayAssignments.seatId,
      roomLabel: rooms.label,
      bedLabel: seats.label,
    })
    .from(stayAssignments)
    .innerJoin(rooms, eq(rooms.id, stayAssignments.roomId))
    .leftJoin(seats, eq(seats.id, stayAssignments.seatId))
    .where(and(eq(stayAssignments.stayId, stay.id), isNull(stayAssignments.endedAt)))
    .limit(1);
  return { stay, place: place ?? null };
}
// Idempotent replay re-proves the same live scope as a new command (SEC-003): branch staff
// with the command's grants, the caller's own Stay, or at least a live account.
export function replayAuthorizer(
  actor: Actor,
  clock: () => Date,
  scope: Record<string, string>,
  grants: readonly InventoryPermission[] = [],
) {
  return async (tx: Transaction) => {
    if (scope.branch) await lockStaffScope(tx, actor, scope.branch, grants, clock);
    else if (scope.stay) await lockOwnStay(tx, actor, scope.stay, clock, false);
    else await lockActor(tx, actor, clock);
    return true;
  };
}
