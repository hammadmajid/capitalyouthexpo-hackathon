import { and, eq } from 'drizzle-orm';
import { bookings, type Database } from '@hsm/db';
import { DomainError, type InventoryPermission } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
import { lockParticipants } from '../management/identity-lock.js';
import { IdempotencyRepository } from '../idempotency/repository.js';
// ACC-001 / SEC-003: resolve under live scope, then release preflight inventory locks.
// The mutation locks both identities in the existing global order before inventory.
export async function confirmationContext(
  database: Database,
  actor: Actor,
  bookingId: string,
  branchId: string,
  clock: () => Date,
  permission: InventoryPermission = 'booking_manage',
) {
  const customerUserId = await database.transaction(async (transaction) => {
    await lockActor(transaction, actor, clock);
    await lockInventoryScope(transaction, actor, branchId, permission);
    await lockActor(transaction, actor, clock);
    const [booking] = await transaction
      .select({ customerUserId: bookings.customerUserId })
      .from(bookings)
      .where(and(eq(bookings.id, bookingId), eq(bookings.branchId, branchId)));
    if (!booking) throw new DomainError('NOT_FOUND', 404, 'Booking unavailable');
    return booking.customerUserId;
  });
  const store = new IdempotencyRepository(database, (transaction, currentActor, now) =>
    lockParticipants(transaction, currentActor, customerUserId, () => now),
  );
  return { customerUserId, store };
}
