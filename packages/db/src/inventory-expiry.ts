import { enqueueBookingLifecycle } from './booking-lifecycle.js';
import { lockInventoryBranch } from './inventory-lock.js';
import { and, eq, isNull, lte } from 'drizzle-orm';
import type { Database } from './index.js';
import {
  branches,
  rooms,
  inventoryClaims,
  bookingHolds,
  bookings,
  bookingHistory,
  hostelAuditLog,
} from './schema/index.js';
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
// Caller owns the branch/room locks. Read paths ignore expired claims without relying on this worker.
export async function expireRoomReservations(transaction: Transaction, roomId: string, now: Date) {
  const expired = await transaction
    .select()
    .from(inventoryClaims)
    .where(
      and(
        eq(inventoryClaims.roomId, roomId),
        isNull(inventoryClaims.releasedAt),
        lte(inventoryClaims.expiresAt, now),
      ),
    )
    .orderBy(inventoryClaims.id)
    .for('update');
  for (const claim of expired) {
    const [branch] = await transaction
      .select({ organizationId: branches.organizationId })
      .from(branches)
      .where(eq(branches.id, claim.branchId));
    if (!branch) throw new Error('Inventory expiry branch unavailable');
    if (claim.holdId)
      await transaction
        .update(bookingHolds)
        .set({ releasedAt: now })
        .where(eq(bookingHolds.id, claim.holdId));
    if (claim.bookingId) {
      const [booking] = await transaction
        .select({ state: bookings.state })
        .from(bookings)
        .where(eq(bookings.id, claim.bookingId))
        .for('update');
      if (!booking || booking.state !== 'pending_request')
        throw new Error('Invalid expiring booking claim');
      await transaction
        .update(bookings)
        .set({ state: 'expired', updatedAt: now })
        .where(eq(bookings.id, claim.bookingId));
      await transaction.insert(bookingHistory).values({
        bookingId: claim.bookingId,
        previousState: 'pending_request',
        nextState: 'expired',
        reasonCode: 'request_expired',
        createdAt: now,
      });
    }
    await transaction
      .update(inventoryClaims)
      .set({ releasedAt: now })
      .where(eq(inventoryClaims.id, claim.id));
    await transaction.insert(hostelAuditLog).values({
      actorRole: 'system',
      organizationId: branch.organizationId,
      branchId: claim.branchId,
      action: 'inventory.expired',
      targetType: claim.holdId ? 'booking_hold' : 'booking',
      targetId: claim.holdId ?? claim.bookingId ?? claim.id,
      after: { expired: true },
      createdAt: now,
    });
    if (claim.bookingId)
      await enqueueBookingLifecycle(
        transaction,
        { event: 'booking.expired', bookingId: claim.bookingId },
        now,
      );
  }
  // Non-reserving requests have no claim, but must still expire authoritatively.
  const pending = await transaction
    .select({ id: bookings.id, branchId: bookings.branchId })
    .from(bookings)
    .where(
      and(
        eq(bookings.roomId, roomId),
        eq(bookings.state, 'pending_request'),
        lte(bookings.requestExpiresAt, now),
      ),
    )
    .orderBy(bookings.id)
    .for('update');
  for (const booking of pending) {
    await transaction
      .update(bookings)
      .set({ state: 'expired', updatedAt: now })
      .where(eq(bookings.id, booking.id));
    await transaction.insert(bookingHistory).values({
      bookingId: booking.id,
      previousState: 'pending_request',
      nextState: 'expired',
      reasonCode: 'request_expired',
      createdAt: now,
    });
    const [branch] = await transaction
      .select({ organizationId: branches.organizationId })
      .from(branches)
      .where(eq(branches.id, booking.branchId));
    if (!branch) throw new Error('Inventory expiry branch unavailable');
    await transaction.insert(hostelAuditLog).values({
      actorRole: 'system',
      organizationId: branch.organizationId,
      branchId: booking.branchId,
      action: 'booking.expired',
      targetType: 'booking',
      targetId: booking.id,
      after: { expired: true },
      createdAt: now,
    });
    await enqueueBookingLifecycle(
      transaction,
      { event: 'booking.expired', bookingId: booking.id },
      now,
    );
  }
  return expired.length + pending.length;
}
export async function sweepExpiredInventory(database: Database, now: Date, batchSize = 100) {
  const claims = await database
    .selectDistinct({ roomId: inventoryClaims.roomId })
    .from(inventoryClaims)
    .where(and(isNull(inventoryClaims.releasedAt), lte(inventoryClaims.expiresAt, now)))
    .orderBy(inventoryClaims.roomId)
    .limit(batchSize);
  const requests = await database
    .selectDistinct({ roomId: bookings.roomId })
    .from(bookings)
    .where(and(eq(bookings.state, 'pending_request'), lte(bookings.requestExpiresAt, now)))
    .orderBy(bookings.roomId)
    .limit(batchSize);
  let count = 0;
  for (const roomId of [...new Set([...claims, ...requests].map((value) => value.roomId))].sort()) {
    count += await database.transaction(async (transaction) => {
      const [room] = await transaction
        .select({ branchId: rooms.branchId })
        .from(rooms)
        .where(eq(rooms.id, roomId));
      if (!room) throw new Error('Inventory expiry room unavailable');
      await lockInventoryBranch(transaction, room.branchId);
      await transaction
        .select({ id: rooms.id })
        .from(rooms)
        .where(eq(rooms.id, roomId))
        .for('update');
      return expireRoomReservations(transaction, roomId, now);
    });
  }
  return count;
}
