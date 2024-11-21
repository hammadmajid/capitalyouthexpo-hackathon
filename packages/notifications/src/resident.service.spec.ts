import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import {
  NotificationService,
  InvalidNotificationJob,
  type NotificationStore,
  type NotificationMessage,
} from './index.js';
import { residentLease as lease, residentNow as now } from '../test/unit/resident.fixture.js';
function fixture() {
  const publish = vi.fn<NotificationStore['publish']>().mockResolvedValue(true),
    publishBooking = vi.fn<NotificationStore['publishBooking']>().mockResolvedValue(true),
    publishResident = vi.fn<NotificationStore['publishResident']>().mockResolvedValue(true);
  return {
    publish,
    publishBooking,
    publishResident,
    service: new NotificationService({ publish, publishBooking, publishResident }, () => now),
  };
}
it('NTF-002: a validated admission lifecycle lease uses only its exact source-verifying resident port', async () => {
  const f = fixture();
  const input = { ...lease, attempts: 1 };
  await f.service.deliver(input);
  expect(f.publishResident).toHaveBeenCalledWith(lease, now);
  expect(f.publish).not.toHaveBeenCalled();
  expect(f.publishBooking).not.toHaveBeenCalled();
});
it('NTF-002: expired admission lifecycle jobs cannot fan out', async () => {
  const f = fixture();
  await f.service.deliver({ ...lease, leaseExpiresAt: now });
  expect(f.publishResident).not.toHaveBeenCalled();
  expect(f.publish).not.toHaveBeenCalled();
  expect(f.publishBooking).not.toHaveBeenCalled();
});
it('ACC-004: required resident source/fanout failure propagates for worker retry', async () => {
  const f = fixture();
  f.publishResident.mockRejectedValue(new Error('Fanout unavailable'));
  await expect(f.service.deliver(lease)).rejects.toThrow('Fanout unavailable');
});
it.each([
  { ...lease, recipientUserId: randomUUID() },
  { ...lease, channel: 'email' },
  { ...lease, leaseToken: null },
  { ...lease, payload: { ...lease.payload, body: 'Injected private text' } },
  { ...lease, payload: { ...lease.payload, event: 'resident.paid' } },
  { ...lease, payload: { ...lease.payload, historyId: 'bad' } },
  { ...lease, payload: { ...lease.payload, stayId: 'bad' } },
])(
  'SEC-003 / NTF-002: malformed or recipient/content injected resident delivery %# rejects before any port',
  async (input) => {
    const f = fixture();
    await expect(f.service.deliver(input as NotificationMessage)).rejects.toBeInstanceOf(
      InvalidNotificationJob,
    );
    expect(f.publishResident).not.toHaveBeenCalled();
    expect(f.publish).not.toHaveBeenCalled();
    expect(f.publishBooking).not.toHaveBeenCalled();
  },
);
