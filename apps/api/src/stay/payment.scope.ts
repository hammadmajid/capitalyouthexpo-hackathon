import type { IdempotencyStore } from '../idempotency/store.js';
import { and, eq } from 'drizzle-orm';
import { stays, type Database } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockParticipants } from '../management/identity-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
import { IdempotencyRepository } from '../idempotency/repository.js';
export async function lockPaymentAuthority(
  tx: Transaction,
  actor: Actor,
  branchId: string,
  stayId: string,
  clock: () => Date,
) {
  await lockActor(tx, actor, clock);
  await lockInventoryScope(tx, actor, branchId, 'finance_view');
  const scope = await lockInventoryScope(tx, actor, branchId, 'payment_record');
  await lockActor(tx, actor, clock);
  const [stay] = await tx
    .select({ id: stays.id, branchId: stays.branchId, userId: stays.userId })
    .from(stays)
    .where(and(eq(stays.branchId, branchId), eq(stays.id, stayId)))
    .for('update');
  if (!stay) throw new DomainError('NOT_FOUND', 404, 'Stay unavailable');
  if (stay.id !== stayId || stay.branchId !== branchId)
    throw new DomainError('INTERNAL', 500, 'Payment Stay scope unavailable');
  return { ...scope, userId: stay.userId };
}
// Reuse the global sorted identity lock order before hierarchy/Stay locks.
// Preflight never authorizes a later mutation: authority and account link are rechecked inside it.
export async function paymentCommandContext(
  db: Database,
  actor: Actor,
  branchId: string,
  stayId: string,
  clock: () => Date,
): Promise<{ store: IdempotencyStore; userId: string | null }> {
  const target = await db.transaction((tx) =>
    lockPaymentAuthority(tx, actor, branchId, stayId, clock),
  );
  const store = new IdempotencyRepository(db, (tx, currentActor, now) =>
    target.userId === null
      ? lockActor(tx, currentActor, () => now)
      : lockParticipants(tx, currentActor, target.userId, () => now),
  );
  return { store, userId: target.userId };
}
