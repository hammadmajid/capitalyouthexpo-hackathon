import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import {
  NotificationService,
  InvalidNotificationJob,
  type NotificationStore,
  type VisitLifecycleLease,
} from './index.js';
const now = new Date('2026-10-22T05:00:00Z');
const lease: VisitLifecycleLease = {
  id: randomUUID(),
  eventType: 'visit.lifecycle',
  channel: 'in_app',
  recipientUserId: null,
  payload: { event: 'visit.changed', visitId: randomUUID(), historyId: randomUUID() },
  leaseToken: randomUUID(),
  leaseExpiresAt: new Date(now.getTime() + 60000),
};
function fixture(enabled = true) {
  const publishVisit = vi
    .fn<(lease: VisitLifecycleLease, now: Date) => Promise<boolean>>()
    .mockResolvedValue(true);
  const store: NotificationStore = {
    publish: vi.fn(),
    publishBooking: vi.fn(),
    publishResident: vi.fn(),
    ...(enabled ? { publishVisit } : {}),
  };
  return { publishVisit, store, service: new NotificationService(store, () => now) };
}
it('VISIT-001 / NTF-002: visit leases use only source-validating delivery', async () => {
  const f = fixture();
  await f.service.deliver(lease);
  expect(f.publishVisit).toHaveBeenCalledWith(lease, now);
  expect(f.store.publish).not.toHaveBeenCalled();
});
it('VISIT-001: missing delivery port fails closed and retry errors propagate', async () => {
  await expect(fixture(false).service.deliver(lease)).rejects.toBeInstanceOf(
    InvalidNotificationJob,
  );
  const f = fixture();
  f.publishVisit.mockRejectedValue(new Error('Unavailable'));
  await expect(f.service.deliver(lease)).rejects.toThrow('Unavailable');
});
it('VISIT-001: expired or injected recipient leases never fan out', async () => {
  const f = fixture();
  await f.service.deliver({ ...lease, leaseExpiresAt: now });
  await expect(
    f.service.deliver({ ...lease, recipientUserId: randomUUID() }),
  ).rejects.toBeInstanceOf(InvalidNotificationJob);
  expect(f.publishVisit).not.toHaveBeenCalled();
});
