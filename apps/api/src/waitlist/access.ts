import { and, eq, isNull } from 'drizzle-orm';
import { customerProfiles, lockInventoryBranch, roomTypes, waitlistEntries } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
import { publicBranch } from '../booking/projection.js';

export async function authorizeWaitlistCustomer(tx: Transaction, actor: Actor, clock: () => Date) {
  await lockActor(tx, actor, clock);
  const [profile] = await tx
    .select({ id: customerProfiles.userId })
    .from(customerProfiles)
    .where(eq(customerProfiles.userId, actor.userId));
  if (!profile) throw new DomainError('FORBIDDEN', 403, 'Customer context required');
}
export async function authorizeWaitlistBranch(
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
export async function lockWaitlistListing(tx: Transaction, branchId: string, roomTypeId?: string) {
  if (!(await publicBranch(tx, branchId)))
    throw new DomainError('NOT_FOUND', 404, 'Hostel unavailable');
  await lockInventoryBranch(tx, branchId);
  if (!(await publicBranch(tx, branchId, true)))
    throw new DomainError('NOT_FOUND', 404, 'Hostel unavailable');
  if (roomTypeId) await requireWaitlistType(tx, branchId, roomTypeId);
}
export async function requireWaitlistType(tx: Transaction, branchId: string, roomTypeId: string) {
  const [type] = await tx
    .select({ id: roomTypes.id })
    .from(roomTypes)
    .where(
      and(
        eq(roomTypes.id, roomTypeId),
        eq(roomTypes.branchId, branchId),
        isNull(roomTypes.archivedAt),
      ),
    )
    .for('update');
  if (!type) throw new DomainError('NOT_FOUND', 404, 'Room type unavailable');
}
export async function lockOwnWaitlistEntry(tx: Transaction, actor: Actor, entryId: string) {
  const condition = and(
    eq(waitlistEntries.id, entryId),
    eq(waitlistEntries.customerUserId, actor.userId),
  );
  const [target] = await tx
    .select({ branchId: waitlistEntries.branchId })
    .from(waitlistEntries)
    .where(condition);
  if (!target) throw new DomainError('NOT_FOUND', 404, 'Waiting-list entry unavailable');
  await lockInventoryBranch(tx, target.branchId);
  const [row] = await tx.select().from(waitlistEntries).where(condition).for('update');
  if (!row) throw new DomainError('NOT_FOUND', 404, 'Waiting-list entry unavailable');
  return row;
}
