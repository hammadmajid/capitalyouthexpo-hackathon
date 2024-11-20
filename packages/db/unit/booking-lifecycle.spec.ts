import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { notificationOutbox } from '../src/schema/index.js';
import {
  bookingLifecycleEventSchema,
  enqueueBookingLifecycle,
  type BookingLifecycleTransaction,
} from '../src/booking-lifecycle.js';
const bookingId = randomUUID(),
  proofId = randomUUID(),
  now = new Date('2026-10-16T00:00:00Z');
function fixture() {
  const conflict = vi
    .fn<(options: { target: unknown }) => Promise<void>>()
    .mockResolvedValue(undefined);
  const values = vi.fn((input: typeof notificationOutbox.$inferInsert) => ({
    input,
    onConflictDoNothing: conflict,
  }));
  const insert = vi.fn(() => ({ values }));
  // Unit-only write double; rollback and constraints remain real PG checks.
  return {
    insert,
    values,
    conflict,
    transaction: { insert } as unknown as BookingLifecycleTransaction,
  };
}
it.each(bookingLifecycleEventSchema.options)(
  'NTF-002 ACC-001: %s persists a deduplicated event without recipient identity locks',
  async (event) => {
    const value = fixture(),
      // SRS v2.11: proof events carry and deduplicate by their exact proof.
      proof = event === 'booking.payment_submitted' || event === 'booking.payment_rejected',
      payload = { event, bookingId, ...(proof ? { proofId } : {}) };
    await enqueueBookingLifecycle(value.transaction, payload, now);
    expect(value.insert).toHaveBeenCalledWith(notificationOutbox);
    expect(value.values).toHaveBeenCalledWith({
      eventType: 'booking.lifecycle',
      channel: 'in_app',
      recipientUserId: null,
      payload,
      dedupeKey: 'booking.lifecycle:' + event + ':' + bookingId + (proof ? ':' + proofId : ''),
      createdAt: now,
      nextAttemptAt: now,
    });
    expect(value.conflict).toHaveBeenCalledWith({ target: notificationOutbox.dedupeKey });
  },
);
it.each([
  { event: 'booking.paid', bookingId },
  { event: 'booking.payment_submitted', bookingId },
  { event: 'booking.approved', bookingId, proofId: randomUUID() },
  { event: 'booking.submitted', bookingId: 'invalid' },
  { event: 'booking.submitted', bookingId, customerUserId: randomUUID() },
  { event: 'booking.submitted', bookingId, cnic: 'Private value' },
])(
  'NTF-002 SEC-003: malformed or identity-bearing input is rejected before writes',
  async (input) => {
    const value = fixture();
    await expect(enqueueBookingLifecycle(value.transaction, input, now)).rejects.toThrow();
    expect(value.insert).not.toHaveBeenCalled();
  },
);
it('NTF-002: UUID case is canonicalized for payload and deduplication', async () => {
  const value = fixture();
  await enqueueBookingLifecycle(
    value.transaction,
    { event: 'booking.submitted', bookingId: bookingId.toUpperCase() },
    now,
  );
  expect(value.values).toHaveBeenCalledWith(
    expect.objectContaining({
      payload: { event: 'booking.submitted', bookingId },
      dedupeKey: 'booking.lifecycle:booking.submitted:' + bookingId,
    }),
  );
});
it('NTF-002: invalid clocks fail before writing', async () => {
  const value = fixture();
  await expect(
    enqueueBookingLifecycle(
      value.transaction,
      { event: 'booking.submitted', bookingId },
      new Date('invalid'),
    ),
  ).rejects.toThrow();
  expect(value.insert).not.toHaveBeenCalled();
});
it('NTF-002 ACC-001: outbox failures propagate to the owning business transaction', async () => {
  const value = fixture();
  value.conflict.mockRejectedValueOnce(new Error('Outbox unavailable'));
  await expect(
    enqueueBookingLifecycle(value.transaction, { event: 'booking.submitted', bookingId }, now),
  ).rejects.toThrow('Outbox unavailable');
});
