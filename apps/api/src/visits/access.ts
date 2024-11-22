import { and, eq } from 'drizzle-orm';
import { branches, customerProfiles, lockInventoryBranch, visitRequests } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
import { publicBranch } from '../booking/projection.js';
export async function authorizeVisitCustomer(tx: Transaction, actor: Actor, clock: () => Date) {
  await lockActor(tx, actor, clock);
  const [profile] = await tx
    .select({ id: customerProfiles.userId })
    .from(customerProfiles)
    .where(eq(customerProfiles.userId, actor.userId));
  if (!profile) throw new DomainError('FORBIDDEN', 403, 'Customer context required');
}
export async function authorizeVisitBranch(
  tx: Transaction,
  actor: Actor,
  branchId: string,
  clock: () => Date,
) {
  await lockActor(tx, actor, clock);
  const scope = await lockInventoryScope(tx, actor, branchId);
  await lockActor(tx, actor, clock);
  return scope;
}
export async function lockVisitListing(tx: Transaction, branchId: string) {
  if (!(await publicBranch(tx, branchId)))
    throw new DomainError('NOT_FOUND', 404, 'Hostel unavailable');
  await lockInventoryBranch(tx, branchId);
  if (!(await publicBranch(tx, branchId, true)))
    throw new DomainError('NOT_FOUND', 404, 'Hostel unavailable');
}
export async function lockVisit(
  tx: Transaction,
  visitId: string,
  scope: { branchId: string } | { customerUserId: string },
) {
  const condition = and(
    eq(visitRequests.id, visitId),
    'branchId' in scope
      ? eq(visitRequests.branchId, scope.branchId)
      : eq(visitRequests.customerUserId, scope.customerUserId),
  );
  const [target] = await tx
    .select({ branchId: visitRequests.branchId })
    .from(visitRequests)
    .where(condition);
  if (!target) throw new DomainError('NOT_FOUND', 404, 'Visit unavailable');
  await lockInventoryBranch(tx, target.branchId);
  const [row] = await tx.select().from(visitRequests).where(condition).for('update');
  if (!row) throw new DomainError('NOT_FOUND', 404, 'Visit unavailable');
  return row;
}
export async function publicVisitBranchId(tx: Transaction, slug: string) {
  const [row] = await tx.select({ id: branches.id }).from(branches).where(eq(branches.slug, slug));
  if (!row || !(await publicBranch(tx, row.id)))
    throw new DomainError('NOT_FOUND', 404, 'Hostel unavailable');
  return row.id;
}
