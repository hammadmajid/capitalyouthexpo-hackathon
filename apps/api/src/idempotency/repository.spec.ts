import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Database } from '@hsm/db';
import { idempotencyKeys } from '@hsm/db';
import { IdempotencyRepository } from './repository.js';
const select = vi.fn(),
  insert = vi.fn(),
  remove = vi.fn();
const database = { select, insert, delete: remove, transaction: vi.fn() };
const actor = { userId: randomUUID(), sessionId: randomUUID() };
const now = new Date('2026-10-08T00:00:00Z');
let identity: { status: string }[];
let session: { id: string; expiresAt: Date; revokedAt: null }[];
const values = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  identity = [{ status: 'active' }];
  session = [{ id: actor.sessionId, expiresAt: new Date(now.getTime() + 1000), revokedAt: null }];
  let count = 0;
  select.mockImplementation(() => {
    const rows = count++ === 0 ? identity : count === 2 ? session : [];
    const chain = {
      from: vi.fn(),
      where: vi.fn(),
      for: vi.fn().mockResolvedValue(rows),
      then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
    };
    chain.from.mockReturnValue(chain);
    chain.where.mockReturnValue(chain);
    return chain;
  });
  insert.mockReturnValue({ values });
  values.mockResolvedValue(undefined);
  remove.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  database.transaction.mockImplementation(async (work: (value: unknown) => Promise<unknown>) =>
    work(database),
  );
});
it('PAY-008: cache persistence, lookup and expiration removal share the identity-locked transaction', async () => {
  const repository = new IdempotencyRepository(database as unknown as Database);
  await repository.transaction(actor, now, async (transaction) => {
    expect(transaction.database).toBe(database);
    expect(await transaction.read(randomUUID())).toBeUndefined();
    const key = randomUUID(),
      value = {
        endpoint: 'POST /action',
        requestHash: Buffer.alloc(32),
        responseStatus: 200,
        responseBody: { status: 'suspended' },
        createdAt: now,
      };
    await transaction.save(key, value);
    expect(insert).toHaveBeenCalledWith(idempotencyKeys);
    expect(values).toHaveBeenCalledWith({ ...value, key, userId: actor.userId });
    await transaction.remove(key);
    expect(remove).toHaveBeenCalledWith(idempotencyKeys);
  });
});
it('SEC: a missing/inactive identity or dead session cannot read or replay a response', async () => {
  const repository = new IdempotencyRepository(database as unknown as Database);
  const work = vi.fn();
  identity = [];
  await expect(repository.transaction(actor, now, work)).rejects.toMatchObject({
    code: 'UNAUTHENTICATED',
  });
  select.mockClear();
  identity = [{ status: 'suspended' }];
  // A fresh select chain starts with the identity for each transaction.
  select.mockImplementation(() => {
    const chain = { from: vi.fn(), where: vi.fn(), for: vi.fn().mockResolvedValue(identity) };
    chain.from.mockReturnValue(chain);
    chain.where.mockReturnValue(chain);
    return chain;
  });
  await expect(repository.transaction(actor, now, work)).rejects.toMatchObject({
    code: 'ACCOUNT_SUSPENDED',
  });
  expect(work).not.toHaveBeenCalled();
});
it('SEC: a revoked or missing persisted session blocks the transaction callback', async () => {
  session = [];
  const work = vi.fn();
  await expect(
    new IdempotencyRepository(database as unknown as Database).transaction(actor, now, work),
  ).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
  expect(work).not.toHaveBeenCalled();
});
