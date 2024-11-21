import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import {
  NotificationService,
  InvalidNotificationJob,
  type NotificationStore,
  type WaitlistLifecycleLease,
} from './index.js';
const now = new Date('2026-10-24T03:00:00Z');
const lease: WaitlistLifecycleLease = {
  id: randomUUID(),
  eventType: 'waitlist.lifecycle',
  channel: 'in_app',
  recipientUserId: null,
  payload: { event: 'waitlist.vacancy', pageId: randomUUID() },
  leaseToken: randomUUID(),
  leaseExpiresAt: new Date(now.getTime() + 60000),
};
function fixture(enabled = true) {
  const publishWaitlist = vi
    .fn<(lease: WaitlistLifecycleLease, now: Date) => Promise<boolean>>()
    .mockResolvedValue(true);
  const store: NotificationStore = {
    publish: vi.fn(),
    publishBooking: vi.fn(),
    publishResident: vi.fn(),
    ...(enabled ? { publishWaitlist } : {}),
  };
  return { publishWaitlist, store, service: new NotificationService(store, () => now) };
}
it('WAIT-001 / NTF-002: page delivery uses only the source-validating transactional port', async () => {
  const f = fixture();
  await f.service.deliver(lease);
  expect(f.publishWaitlist).toHaveBeenCalledWith(lease, now);
  expect(f.store.publish).not.toHaveBeenCalled();
});
it('WAIT-001: missing port fails closed and recoverable errors propagate for retry', async () => {
  await expect(fixture(false).service.deliver(lease)).rejects.toBeInstanceOf(
    InvalidNotificationJob,
  );
  const f = fixture();
  f.publishWaitlist.mockRejectedValue(new Error('Unavailable'));
  await expect(f.service.deliver(lease)).rejects.toThrow('Unavailable');
});
it('WAIT-001 / SEC-003: expired, recipient-injected and expanded page payloads never fan out', async () => {
  const f = fixture();
  await f.service.deliver({ ...lease, leaseExpiresAt: now });
  await expect(
    f.service.deliver({ ...lease, recipientUserId: randomUUID() }),
  ).rejects.toBeInstanceOf(InvalidNotificationJob);
  await expect(
    f.service.deliver({ ...lease, payload: { ...lease.payload, userId: randomUUID() } }),
  ).rejects.toBeInstanceOf(InvalidNotificationJob);
  expect(f.publishWaitlist).not.toHaveBeenCalled();
});
