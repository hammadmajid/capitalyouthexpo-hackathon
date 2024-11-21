import { beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { SessionRepository } from './session.repository.js';
import type { Database } from '@hsm/db';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
const actorId = randomUUID();
const execute = vi.fn();
const database = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
};
const chain = {
  from: vi.fn(),
  innerJoin: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  for: vi.fn(),
  values: vi.fn(),
  onConflictDoNothing: vi.fn(),
  set: vi.fn(),
};
beforeEach(() => {
  vi.resetAllMocks();
  database.select.mockReturnValue(chain);
  database.insert.mockReturnValue(chain);
  database.update.mockReturnValue(chain);
  for (const method of ['from', 'set', 'innerJoin'] as const) chain[method].mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.limit.mockResolvedValue([{ userId: actorId }]);
  chain.for.mockResolvedValue([{ id: actorId, accountStatus: 'active' }]);
  chain.values.mockReturnValue(chain);
  chain.onConflictDoNothing.mockResolvedValue(undefined);
  database.transaction.mockImplementation(async (work: (value: unknown) => Promise<unknown>) =>
    work(database),
  );
  execute.mockResolvedValue([]);
});
const repository = () => new SessionRepository(database as unknown as Database);
it('SEC: identifies a hashed credential and handles unknown credentials', async () => {
  expect(await repository().identify('digest')).toBe(actorId);
  chain.limit.mockResolvedValue([]);
  expect(await repository().identify('missing')).toBeUndefined();
});
it('SEC: locks identity before transactional session queries and writes', async () => {
  await repository().transaction(actorId, async (transaction) => {
    expect(transaction.identity).toEqual({
      id: actorId,
      accountStatus: 'active',
      managerActive: true,
    });
    expect(chain.for).toHaveBeenCalledWith('update');
    chain.where.mockResolvedValueOnce([]);
    expect(await transaction.list()).toEqual([]);
    const now = new Date('2026-10-07T12:00:00Z');
    const value = {
      id: 'session',
      refreshTokenHash: 'digest',
      client: 'mobile' as const,
      createdAt: now,
      lastUsedAt: now,
      expiresAt: now,
    };
    await transaction.insert(value);
    expect(chain.values).toHaveBeenCalledWith({ ...value, userId: actorId });
    await transaction.rotate('old', value, now);
    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({ replacedBySessionId: 'session', revokedReason: 'rotated' }),
    );
    await transaction.revoke(['session'], 'refresh_reuse', now);
    expect(chain.set).toHaveBeenCalledWith({ revokedAt: now, revokedReason: 'refresh_reuse' });
    await transaction.setPassword('protected-hash', now);
    expect(chain.set).toHaveBeenCalledWith({ passwordHash: 'protected-hash', updatedAt: now });
    const count = database.update.mock.calls.length;
    await transaction.revoke([], 'logout', now);
    expect(database.update).toHaveBeenCalledTimes(count);
  });
});
it('SEC: a missing identity remains unavailable to the service', async () => {
  chain.for.mockResolvedValue([]);
  await repository().transaction('missing', async (transaction) => {
    expect(transaction.identity).toBeUndefined();
  });
});

it('NTF-002: password change queues a fixed security notice inside the identity transaction', async () => {
  const now = new Date();
  await repository().transaction(actorId, (transaction) =>
    transaction.setPassword('protected-hash', now),
  );
  expect(chain.values).toHaveBeenCalledWith(
    expect.objectContaining({
      eventType: 'notification.create',
      channel: 'in_app',
      recipientUserId: actorId,
      payload: expect.objectContaining({ event: 'account.password_changed' }),
      createdAt: now,
    }),
  );
});
it('NTF-002: notification persistence failure prevents committing a password change', async () => {
  chain.onConflictDoNothing.mockRejectedValueOnce(new Error('Notification unavailable'));
  await expect(
    repository().transaction(actorId, (transaction) =>
      transaction.setPassword('protected-hash', new Date()),
    ),
  ).rejects.toThrow('Notification unavailable');
});

it('SEC-001/AUTH-M-005: phone-only manager eligibility excludes archived brands', async () => {
  await repository().transaction(actorId, async () => undefined);
  const predicates = chain.where.mock.calls.map((call) => call[0] as SQL);
  expect(
    predicates.some((predicate) =>
      new PgDialect().sqlToQuery(predicate).sql.includes('"brands"."archived_at" is null'),
    ),
  ).toBe(true);
});
