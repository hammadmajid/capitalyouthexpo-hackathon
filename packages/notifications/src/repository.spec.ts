import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { notifications, notificationOutbox, type Database } from '@hsm/db';
import { NotificationRepository } from './repository.js';
import type { NotificationLease, NotificationTransaction } from './index.js';
const now = new Date('2026-10-08T12:00:00Z');
const lease: NotificationLease = {
  id: randomUUID(),
  eventType: 'notification.create',
  channel: 'in_app',
  recipientUserId: randomUUID(),
  payload: { event: 'account.email_verified', operationId: randomUUID() },
  leaseToken: randomUUID(),
  leaseExpiresAt: new Date(now.getTime() + 60000),
};
type Row = typeof notificationOutbox.$inferSelect;
const row: Row = {
  ...lease,
  recipientAddress: null,
  dedupeKey: 'fixture:' + lease.id,
  status: 'pending',
  attempts: 1,
  nextAttemptAt: now,
  lastError: null,
  providerMessageId: null,
  createdAt: now,
  sentAt: null,
};
function fixture(change: Partial<Row> = {}, missing = false) {
  const current = { ...row, ...change };
  const locks = vi.fn().mockResolvedValue(missing ? [] : [current]);
  const query = { from: vi.fn(), where: vi.fn(), for: locks };
  query.from.mockReturnValue(query);
  query.where.mockReturnValue(query);
  const conflict = vi.fn().mockResolvedValue(undefined);
  const insert = vi
    .fn()
    .mockReturnValue({ values: vi.fn().mockReturnValue({ onConflictDoNothing: conflict }) });
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where: updateWhere });
  const update = vi.fn().mockReturnValue({ set });
  const transaction = {
    select: vi.fn().mockReturnValue(query),
    insert,
    update,
  } as unknown as NotificationTransaction;
  const database = {
    transaction: vi.fn(async (work: (tx: NotificationTransaction) => Promise<boolean>) =>
      work(transaction),
    ),
  } as unknown as Database;
  const repository = new NotificationRepository(database, () => now);
  return { current, locks, insert, conflict, update, set, database, repository };
}
afterEach(() => vi.useRealTimers());
it('NTF-002: the same locked transaction inserts one recipient-owned notice and acknowledges its lease', async () => {
  const value = fixture();
  expect(await value.repository.publish(lease, now)).toBe(true);
  expect(value.locks).toHaveBeenCalledWith('update');
  expect(value.insert).toHaveBeenCalledWith(notifications);
  expect(value.conflict).toHaveBeenCalledWith({ target: notifications.dedupeKey });
  expect(value.update).toHaveBeenCalledWith(notificationOutbox);
  expect(value.set).toHaveBeenCalledWith({
    status: 'sent',
    sentAt: now,
    lastError: null,
    leaseToken: null,
    leaseExpiresAt: null,
  });
  expect(value.conflict.mock.invocationCallOrder[0]).toBeLessThan(
    value.set.mock.invocationCallOrder[0] ?? 0,
  );
});
it.each([
  { status: 'sent' as const },
  { status: 'dead' as const },
  { leaseToken: randomUUID() },
  { leaseExpiresAt: null },
  { leaseExpiresAt: now },
  { channel: 'email' as const },
  { eventType: 'unsupported' },
  { recipientUserId: randomUUID() },
  { payload: {} },
  { payload: { event: 'unknown', operationId: randomUUID() } },
  { payload: { ...lease.payload, event: 'account.password_reset' } },
  { payload: { ...lease.payload, operationId: randomUUID() } },
])(
  'NTF-002: terminal, expired, replaced or changed messages cannot create or acknowledge notices',
  async (change) => {
    const value = fixture(change);
    expect(await value.repository.publish(lease, now)).toBe(false);
    expect(value.insert).not.toHaveBeenCalled();
    expect(value.update).not.toHaveBeenCalled();
  },
);
it('NTF-002: absent outbox work cannot publish', async () => {
  const value = fixture({}, true);
  expect(await value.repository.publish(lease, now)).toBe(false);
  expect(value.insert).not.toHaveBeenCalled();
});
it('NTF-002: clock is refreshed after row locking, and a future caller clock cannot be moved backwards', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const value = fixture();
  const repository = new NotificationRepository(value.database);
  value.locks.mockImplementationOnce(async () => {
    vi.setSystemTime(lease.leaseExpiresAt);
    return [value.current];
  });
  expect(await repository.publish(lease, now)).toBe(false);
  expect(value.insert).not.toHaveBeenCalled();
  expect(await value.repository.publish(lease, lease.leaseExpiresAt)).toBe(false);
});
it('NTF-002: insertion or acknowledgement failure propagates to roll back the enclosing transaction', async () => {
  const value = fixture();
  value.conflict.mockRejectedValueOnce(new Error('Insert unavailable'));
  await expect(value.repository.publish(lease, now)).rejects.toThrow('Insert unavailable');
  expect(value.update).not.toHaveBeenCalled();
  value.set.mockImplementationOnce(() => {
    throw new Error('Ack unavailable');
  });
  await expect(value.repository.publish(lease, now)).rejects.toThrow('Ack unavailable');
});
