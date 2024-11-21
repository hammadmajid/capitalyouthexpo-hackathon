import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import {
  lockInventoryBranch,
  notificationOutbox,
  notifications,
  waitlistAvailability,
  waitlistEntries,
  waitlistFanoutPages,
  waitlistVacancyEvents,
} from '@hsm/db';
import { InvalidNotificationJob, type NotificationLease } from './index.js';
import {
  waitlistFixture,
  now,
  lease,
  branchId,
  customerId,
  eventId,
} from '../test/waitlist.fixture.js';
import { waitlistRecipientPage } from './waitlist-recipients.js';
const mocks = vi.hoisted(() => ({ lock: vi.fn<() => Promise<void>>() }));
vi.mock('@hsm/db', async (original) => ({
  ...(await original<typeof import('@hsm/db')>()),
  lockInventoryBranch: mocks.lock,
  reconcileWaitlistAvailability: vi.fn().mockResolvedValue(0),
}));
beforeEach(() => {
  mocks.lock.mockReset().mockResolvedValue(undefined);
});
it('WAIT-001 / NTF-002: fanout binds source proof, deduplicates by event/customer and acknowledges the lease', async () => {
  const f = waitlistFixture();
  expect(await f.repository.publishWaitlist(lease, now)).toBe(true);
  expect(lockInventoryBranch).toHaveBeenCalledWith(f.tx, branchId);
  expect(f.writes).toEqual([
    {
      table: notificationOutbox,
      value: expect.objectContaining({
        recipientUserId: customerId,
        payload: { event: 'waitlist.vacancy', operationId: eventId },
        dedupeKey: 'in_app:' + customerId + ':waitlist.vacancy:' + eventId,
      }),
    },
  ]);
  expect(f.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent', leaseToken: null }));
});
it.each([
  { status: 'sent' as const },
  { status: 'dead' as const },
  { eventType: 'unsupported' },
  { channel: 'email' as const },
  { recipientUserId: customerId },
  { leaseToken: randomUUID() },
  { leaseExpiresAt: null },
  { leaseExpiresAt: now },
  { payload: {} },
  { payload: { ...lease.payload, pageId: randomUUID() } },
])('WAIT-001: invalid persisted leases cannot publish or acknowledge', async (patch) => {
  const f = waitlistFixture(patch);
  expect(await f.repository.publishWaitlist(lease, now)).toBe(false);
  expect(f.writes).toHaveLength(0);
  expect(f.set).not.toHaveBeenCalled();
});
it.each([notificationOutbox, waitlistFanoutPages, waitlistVacancyEvents])(
  'WAIT-001: missing source cannot fabricate recipients',
  async (table) => {
    const f = waitlistFixture();
    f.data.set(table, []);
    if (table === notificationOutbox)
      expect(await f.repository.publishWaitlist(lease, now)).toBe(false);
    else
      await expect(f.repository.publishWaitlist(lease, now)).rejects.toBeInstanceOf(
        InvalidNotificationJob,
      );
    expect(f.writes).toHaveLength(0);
  },
);
it('WAIT-001: every completed bounded page schedules the next immutable page in its transaction', async () => {
  const f = waitlistFixture();
  const recipients = Array.from({ length: 101 }, () => ({
    id: randomUUID(),
    userId: randomUUID(),
  }));
  f.data.set(waitlistEntries, recipients);
  expect(await f.repository.publishWaitlist(lease, now)).toBe(true);
  expect(f.writes).toHaveLength(102);
  expect(f.writes[100]).toMatchObject({
    table: waitlistFanoutPages,
    value: { branchId, eventId, afterEntryId: recipients[99]?.id },
  });
  expect(f.writes[101]).toMatchObject({
    table: notificationOutbox,
    value: { eventType: 'waitlist.lifecycle' },
  });
});
it('WAIT-001: an empty/suppressed page is acknowledged without an alert', async () => {
  const f = waitlistFixture();
  f.data.set(waitlistAvailability, []);
  expect(await f.repository.publishWaitlist(lease, now)).toBe(true);
  expect(f.writes).toHaveLength(0);
});
it('WAIT-001: expiry during hierarchy locking or recipient enqueue never acknowledges', async () => {
  const f = waitlistFixture();
  f.expireAfterInsert();
  await expect(f.repository.publishWaitlist(lease, now)).rejects.toThrow('lease expired');
  expect(f.set).not.toHaveBeenCalled();
  const locked = waitlistFixture();
  mocks.lock.mockImplementation(async () => {
    locked.advanceClock(lease.leaseExpiresAt);
  });
  await expect(locked.repository.publishWaitlist(lease, now)).rejects.toThrow('lease expired');
  expect(locked.writes).toHaveLength(0);
  expect(locked.set).not.toHaveBeenCalled();
});
it('WAIT-001 / SEC-003: recipient SQL binds exact branch, active identity/preference, original event cutoff and cursor', async () => {
  const f = waitlistFixture(),
    roomTypeId = randomUUID(),
    after = randomUUID();
  f.data.set(waitlistAvailability, [{ roomTypeId: null }, { roomTypeId }]);
  await waitlistRecipientPage(
    f.tx,
    {
      id: eventId,
      branchId,
      roomTypeId,
      branchBecameAvailable: true,
      typeBecameAvailable: true,
      availableOn: '2026-10-24',
      createdAt: now,
    },
    after,
    customerId,
  );
  const predicate = f.filters.at(-1) as SQL,
    query = new PgDialect().sqlToQuery(predicate);
  for (const value of [branchId, customerId, roomTypeId, after, 'active'])
    expect(query.params).toContain(value);
  expect(query.sql).toContain('"left_at" is null');
  expect(query.sql).toContain('"joined_at" <=');
  expect(query.sql).toContain('"id" >');
});
it('WAIT-001: named-type observations do not require branch-wide availability', async () => {
  const f = waitlistFixture(),
    roomTypeId = randomUUID();
  f.data.set(waitlistAvailability, [{ roomTypeId }]);
  const event = {
    id: eventId,
    branchId,
    roomTypeId,
    branchBecameAvailable: false,
    typeBecameAvailable: true,
    availableOn: '2026-10-24',
    createdAt: now,
  };
  expect(await waitlistRecipientPage(f.tx, event, null)).toHaveLength(1);
});
it.each([true, false])(
  'WAIT-001: final inbox publication revalidates live eligibility (%s)',
  async (eligible) => {
    const input: NotificationLease = {
      ...lease,
      eventType: 'notification.create',
      recipientUserId: customerId,
      payload: { event: 'waitlist.vacancy', operationId: eventId },
    };
    const f = waitlistFixture(input);
    if (!eligible) f.data.set(waitlistEntries, []);
    expect(await f.repository.publish(input, now)).toBe(true);
    expect(f.writes.filter((write) => write.table === notifications)).toHaveLength(
      eligible ? 1 : 0,
    );
    expect(f.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent' }));
  },
);
it('WAIT-001: final inbox publication rejects a fabricated source event', async () => {
  const input: NotificationLease = {
    ...lease,
    eventType: 'notification.create',
    recipientUserId: customerId,
    payload: { event: 'waitlist.vacancy', operationId: eventId },
  };
  const f = waitlistFixture(input);
  f.data.set(waitlistVacancyEvents, []);
  await expect(f.repository.publish(input, now)).rejects.toBeInstanceOf(InvalidNotificationJob);
  expect(f.writes).toHaveLength(0);
  expect(f.set).not.toHaveBeenCalled();
});

it('WAIT-001: final inbox lease cannot expire while waiting for the inventory hierarchy', async () => {
  const input: NotificationLease = {
    ...lease,
    eventType: 'notification.create',
    recipientUserId: customerId,
    payload: { event: 'waitlist.vacancy', operationId: eventId },
  };
  const f = waitlistFixture(input);
  mocks.lock.mockImplementation(async () => {
    f.advanceClock(lease.leaseExpiresAt);
  });
  await expect(f.repository.publish(input, now)).rejects.toThrow('lease expired');
  expect(f.writes).toHaveLength(0);
  expect(f.set).not.toHaveBeenCalled();
});
