import { z } from 'zod';
import type { Database } from './index.js';
import { notificationOutbox } from './schema/index.js';
export const bookingLifecycleEventSchema = z.enum([
  'booking.submitted',
  'booking.confirmed',
  'booking.rejected',
  'booking.cancelled',
  'booking.expired',
  // SRS v2.11 upfront verification steps; proof events name their exact proof.
  'booking.approved',
  'booking.payment_submitted',
  'booking.payment_rejected',
]);
const uuid = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export const bookingLifecyclePayloadSchema = z
  .object({ event: bookingLifecycleEventSchema, bookingId: uuid, proofId: uuid.optional() })
  .strict()
  .refine(
    (value) =>
      (value.proofId !== undefined) ===
      (value.event === 'booking.payment_submitted' || value.event === 'booking.payment_rejected'),
    'Proof events require exactly their proof',
  );
export type BookingLifecycleEvent = z.infer<typeof bookingLifecycleEventSchema>;
export type BookingLifecycleTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];
// NTF-002 / ACC-001: recipient-free events commit with booking state/history.
// Recipient FK writes occur later, without holding inventory locks.
export async function enqueueBookingLifecycle(
  transaction: BookingLifecycleTransaction,
  input: unknown,
  now: Date,
) {
  const payload = bookingLifecyclePayloadSchema.parse(input),
    createdAt = z.date().parse(now);
  await transaction
    .insert(notificationOutbox)
    .values({
      eventType: 'booking.lifecycle',
      channel: 'in_app',
      recipientUserId: null,
      payload,
      dedupeKey:
        'booking.lifecycle:' +
        payload.event +
        ':' +
        payload.bookingId +
        (payload.proofId ? ':' + payload.proofId : ''),
      createdAt,
      nextAttemptAt: createdAt,
    })
    .onConflictDoNothing({ target: notificationOutbox.dedupeKey });
}
