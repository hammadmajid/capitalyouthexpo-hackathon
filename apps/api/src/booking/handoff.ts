import { and, desc, eq, isNull } from 'drizzle-orm';
import { bookingDocuments, bookingHistory, bookings, inventoryClaims } from '@hsm/db';
import { DomainError, confirmedBookingHandoffSchema } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
import { upfrontProjections } from './upfront.js';
// Phase 4 input: read the confirmed booking exactly as committed; never creates a Stay.
export async function confirmedBookingHandoff(transaction: Transaction, bookingId: string) {
  const [booking] = await transaction.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!booking || booking.state !== 'confirmed')
    throw new DomainError('CONFLICT', 409, 'Only confirmed bookings can be handed off');
  const [confirmed] = await transaction
    .select({ at: bookingHistory.createdAt })
    .from(bookingHistory)
    .where(and(eq(bookingHistory.bookingId, booking.id), eq(bookingHistory.nextState, 'confirmed')))
    .orderBy(desc(bookingHistory.createdAt))
    .limit(1);
  const [claim] = await transaction
    .select({ id: inventoryClaims.id })
    .from(inventoryClaims)
    .where(and(eq(inventoryClaims.bookingId, booking.id), isNull(inventoryClaims.releasedAt)))
    .limit(1);
  if (!confirmed || !claim)
    throw new DomainError('CONFLICT', 409, 'Confirmed booking reservation is unavailable');
  const documents = await transaction
    .select({ kind: bookingDocuments.kind, state: bookingDocuments.state })
    .from(bookingDocuments)
    .where(eq(bookingDocuments.bookingId, booking.id))
    .orderBy(bookingDocuments.kind);
  return confirmedBookingHandoffSchema.parse({
    bookingId: booking.id,
    customerUserId: booking.customerUserId,
    branchId: booking.branchId,
    roomId: booking.roomId,
    bedId: booking.seatId,
    state: 'confirmed',
    confirmedAt: confirmed.at.toISOString(),
    moveInDate: booking.moveInDate,
    moveOutDate: booking.moveOutDate,
    policyVersionId: booking.policyVersionId,
    quote: booking.quoteSnapshot,
    documents,
    upfront: (await upfrontProjections(transaction, [booking.id])).get(booking.id) ?? null,
    reservationClaimId: claim.id,
    version: booking.updatedAt.toISOString(),
  });
}
