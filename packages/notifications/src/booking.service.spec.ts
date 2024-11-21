import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import {
  NotificationService,
  InvalidNotificationJob,
  type NotificationStore,
  type NotificationMessage,
  type BookingLifecycleLease,
} from './index.js';
const now = new Date('2026-10-16T00:00:00Z');
const lease: BookingLifecycleLease = {
  id: randomUUID(),
  eventType: 'booking.lifecycle',
  channel: 'in_app',
  recipientUserId: null,
  payload: { event: 'booking.submitted', bookingId: randomUUID() },
  leaseToken: randomUUID(),
  leaseExpiresAt: new Date(now.getTime() + 60000),
};
function fixture() {
  const publish = vi.fn<NotificationStore['publish']>().mockResolvedValue(true),
    publishBooking = vi.fn<NotificationStore['publishBooking']>().mockResolvedValue(true);
  return {
    publish,
    publishBooking,
    service: new NotificationService(
      {
        publish,
        publishBooking,
        publishResident: vi.fn<NotificationStore['publishResident']>().mockResolvedValue(true),
      },
      () => now,
    ),
  };
}
it('NTF-002: valid booking lifecycle leases use only the source-validating fanout port', async () => {
  const value = fixture();
  const input = { ...lease, attempts: 1 };
  await value.service.deliver(input);
  expect(value.publishBooking).toHaveBeenCalledWith(lease, now);
  expect(value.publish).not.toHaveBeenCalled();
});
it('NTF-002: expired lifecycle leases do not enqueue recipient jobs', async () => {
  const value = fixture();
  await value.service.deliver({ ...lease, leaseExpiresAt: now });
  expect(value.publishBooking).not.toHaveBeenCalled();
  expect(value.publish).not.toHaveBeenCalled();
});
it('NTF-002: fanout failures propagate for existing worker retries', async () => {
  const value = fixture();
  value.publishBooking.mockRejectedValue(new Error('Database unavailable'));
  await expect(value.service.deliver(lease)).rejects.toThrow('Database unavailable');
});
it.each([
  { ...lease, recipientUserId: randomUUID() },
  { ...lease, channel: 'email' },
  { ...lease, leaseToken: null },
  { ...lease, payload: { ...lease.payload, cnic: 'Private value' } },
  { ...lease, payload: { ...lease.payload, event: 'booking.paid' } },
  { ...lease, payload: { ...lease.payload, bookingId: 'invalid' } },
])(
  'NTF-002 SEC-003: malformed or recipient-injected lifecycle jobs fail before fanout',
  async (input) => {
    const value = fixture();
    await expect(value.service.deliver(input as NotificationMessage)).rejects.toBeInstanceOf(
      InvalidNotificationJob,
    );
    expect(value.publishBooking).not.toHaveBeenCalled();
    expect(value.publish).not.toHaveBeenCalled();
  },
);
