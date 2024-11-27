import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Database } from '@hsm/db';
import { OutboxRepository, type OutboxMessage } from './repository.js';
const now = new Date('2026-10-07T12:00:00.000Z');
const row: OutboxMessage = {
  id: randomUUID(),
  eventType: 'auth.otp',
  channel: 'email',
  recipientUserId: null,
  recipientAddress: 'person@example.test',
  payload: {},
  dedupeKey: randomUUID(),
  status: 'pending',
  attempts: 0,
  nextAttemptAt: now,
  lastError: null,
  providerMessageId: null,
  createdAt: now,
  sentAt: null,
  leaseToken: null,
  leaseExpiresAt: null,
};
const selected = vi.fn();
const set = vi.fn();
const returned = vi.fn();
const chain = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  for: selected,
  orderBy: vi.fn().mockReturnThis(),
  limit: selected,
  returning: returned,
};
const database = {
  select: vi.fn(() => chain),
  update: vi.fn(() => ({
    set: (values: unknown) => {
      set(values);
      return chain;
    },
  })),
  transaction: async <T>(work: (db: unknown) => Promise<T>) => work(database),
};
const repository = new OutboxRepository(database as unknown as Database);
beforeEach(() => {
  vi.clearAllMocks();
  selected.mockResolvedValue([row]);
  returned.mockResolvedValue([{ ...row, attempts: 1, leaseToken: randomUUID() }]);
});
it('NTF-002: due scan is bounded and row claims persist an attempt with an expiring lease', async () => {
  await repository.due(now);
  expect(chain.limit).toHaveBeenCalledWith(100);
  const claimed = await repository.claim(row.id, now);
  expect(claimed?.attempts).toBe(1);
  expect(chain.for).toHaveBeenCalledWith('update');
  expect(set).toHaveBeenCalledWith(
    expect.objectContaining({
      attempts: 1,
      leaseExpiresAt: new Date(now.getTime() + 60000),
      leaseToken: expect.any(String),
    }),
  );
});
it.each([
  undefined,
  { ...row, status: 'sent' },
  { ...row, status: 'dead' },
  { ...row, nextAttemptAt: new Date(now.getTime() + 1) },
  { ...row, leaseExpiresAt: new Date(now.getTime() + 1) },
])('NTF-002: missing, terminal, leased or not-due rows cannot be delivered: %j', async (value) => {
  selected.mockResolvedValue(value ? [value] : []);
  await expect(repository.claim(row.id, now)).resolves.toBeUndefined();
  expect(set).not.toHaveBeenCalled();
});
it('NTF-002: exhausted and expired leases resolve safely', async () => {
  selected.mockResolvedValue([{ ...row, attempts: 5 }]);
  await expect(repository.claim(row.id, now)).resolves.toBeUndefined();
  expect(set).toHaveBeenLastCalledWith(
    expect.objectContaining({ status: 'dead', lastError: 'DELIVERY_EXHAUSTED' }),
  );
  selected.mockResolvedValue([{ ...row, leaseExpiresAt: now }]);
  expect(await repository.claim(row.id, now)).toBeDefined();
});
it('NTF-002: only leased rows can acknowledge delivery or record bounded failures', async () => {
  await repository.sent(row, 'id', now);
  await repository.failed(row, 'DELIVERY_FAILED', now);
  expect(set).not.toHaveBeenCalled();
  const leased = { ...row, attempts: 1, leaseToken: randomUUID() };
  await repository.sent(leased, 'provider-id', now);
  expect(set).toHaveBeenLastCalledWith(
    expect.objectContaining({ status: 'sent', sentAt: now, leaseToken: null, lastError: null }),
  );
  await repository.failed(leased, 'DELIVERY_FAILED', now);
  expect(set).toHaveBeenLastCalledWith(
    expect.objectContaining({ status: 'failed', nextAttemptAt: new Date(now.getTime() + 2000) }),
  );
  await repository.failed({ ...leased, attempts: 5 }, 'DELIVERY_FAILED', now);
  expect(set).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'dead' }));
  await repository.failed(leased, 'INVALID_MESSAGE', now);
  expect(set).toHaveBeenLastCalledWith(
    expect.objectContaining({ status: 'dead', lastError: 'INVALID_MESSAGE' }),
  );
  await repository.failed({ ...leased, attempts: 12 }, 'DELIVERY_FAILED', now);
  expect(set).toHaveBeenLastCalledWith(
    expect.objectContaining({ nextAttemptAt: new Date(now.getTime() + 300000) }),
  );
});

it('NTF-002 / RENT-004: a due failed retry acquires a pending lease without losing its attempt history', async () => {
  selected.mockResolvedValue([
    { ...row, status: 'failed', attempts: 2, lastError: 'DELIVERY_FAILED' },
  ]);
  await repository.claim(row.id, now);
  expect(chain.for).toHaveBeenCalledWith('update');
  expect(set).toHaveBeenCalledWith(
    expect.objectContaining({
      status: 'pending',
      attempts: 3,
      leaseToken: expect.any(String),
      leaseExpiresAt: new Date(now.getTime() + 60000),
    }),
  );
  expect(set).not.toHaveBeenCalledWith(expect.objectContaining({ lastError: null }));
});
