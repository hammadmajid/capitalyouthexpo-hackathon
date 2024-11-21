import { eq } from 'drizzle-orm';
import { bookingPaymentProofs, bookings } from '@hsm/db';
import type { NotificationTransaction } from './producer.js';
import { bookingStaffEligible, reviewGrants } from './booking-staff.js';
// NTF-002 / ACC-002: staff booking notices require live authority at delivery; a reviewed
// proof no longer produces a stale review prompt.
export async function bookingStaffNoticeEligible(
  transaction: NotificationTransaction,
  userId: string,
  event: 'booking.received' | 'booking.payment_review',
  operationId: string,
) {
  if (event === 'booking.received') {
    const [booking] = await transaction
      .select({ branchId: bookings.branchId })
      .from(bookings)
      .where(eq(bookings.id, operationId));
    return booking
      ? bookingStaffEligible(transaction, userId, booking.branchId, ['booking_manage'])
      : false;
  }
  const [proof] = await transaction
    .select({ branchId: bookingPaymentProofs.branchId, state: bookingPaymentProofs.state })
    .from(bookingPaymentProofs)
    .where(eq(bookingPaymentProofs.id, operationId));
  return proof?.state === 'submitted'
    ? bookingStaffEligible(transaction, userId, proof.branchId, reviewGrants)
    : false;
}
