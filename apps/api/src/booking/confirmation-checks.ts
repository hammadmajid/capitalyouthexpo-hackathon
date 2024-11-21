import { eq } from 'drizzle-orm';
import { branches, type bookings } from '@hsm/db';
import { DomainError, bookingQuoteSnapshotSchema } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { requireInventoryAvailable } from './availability.js';
import { requireBookingCustomer } from './evidence.js';
import { requireBookingAddress } from './address.js';
import { requireBookingCategory } from './category.policy.js';
import { requireConfirmationEvidence } from './confirmation-evidence.js';
type Booking = typeof bookings.$inferSelect;
function requireLive(booking: Booking, now: Date) {
  if (
    booking.state !== 'pending_request' ||
    !booking.requestExpiresAt ||
    booking.requestExpiresAt <= now
  )
    throw new DomainError('CONFLICT', 409, 'Booking request expired or already processed');
}
// BKG-002 / BKG-009 / CHG-007: approval and confirmation share one live validation.
export async function requireConfirmable(
  transaction: Transaction,
  actor: Actor,
  booking: Booking,
  branchId: string,
  clock: () => Date,
  bucket?: string,
) {
  requireLive(booking, clock());
  const quote = bookingQuoteSnapshotSchema.parse(booking.quoteSnapshot);
  await requireConfirmationEvidence(transaction, booking, quote, bucket);
  await lockActor(transaction, actor, clock);
  const gender = await requireBookingCustomer(transaction, { userId: booking.customerUserId });
  await requireBookingAddress(transaction, booking.customerUserId);
  const [branch] = await transaction
    .select({ category: branches.category })
    .from(branches)
    .where(eq(branches.id, branchId));
  if (!branch) throw new DomainError('NOT_FOUND', 404, 'Booking branch unavailable');
  requireBookingCategory(gender, branch.category);
  const now = clock();
  requireLive(booking, now);
  await requireInventoryAvailable(transaction, quote, now, undefined, booking.id);
  return { quote, now };
}
