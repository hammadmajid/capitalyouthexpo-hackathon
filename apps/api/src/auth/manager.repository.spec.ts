import { beforeEach, expect, it, vi } from 'vitest';
import type { Database } from '@hsm/db';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { ManagerRepository } from './manager.repository.js';
import { grantFullBranchAccess } from './manager-full-access.js';
vi.mock('./manager-full-access.js', () => ({ grantFullBranchAccess: vi.fn() }));
const database = { select: vi.fn(), update: vi.fn(), transaction: vi.fn() };
const chain = {
  from: vi.fn(),
  where: vi.fn(),
  for: vi.fn(),
  set: vi.fn(),
  innerJoin: vi.fn(),
  limit: vi.fn(),
};
const invitation = {
  id: 'assignment',
  userId: 'actor',
  branchId: 'branch',
  status: 'pending_activation',
};
beforeEach(() => {
  vi.resetAllMocks();
  database.select.mockReturnValue(chain);
  database.update.mockReturnValue(chain);
  for (const method of ['from', 'where', 'set', 'innerJoin'] as const)
    chain[method].mockReturnValue(chain);
  chain.for
    .mockResolvedValueOnce([{ id: 'actor', accountStatus: 'active', passwordHash: null }])
    .mockResolvedValueOnce([invitation]);
  chain.limit.mockResolvedValue([{ id: 'branch' }]);
  database.transaction.mockImplementation(async (work: (value: unknown) => Promise<unknown>) =>
    work(database),
  );
});
const repository = () => new ManagerRepository(database as unknown as Database);
it('AUTH-M-003: identity and assignment lock precede persistent attempts and atomic activation', async () => {
  const now = new Date();
  await repository().transaction('+923001234567', async (transaction) => {
    expect(transaction.identity?.id).toBe('actor');
    expect(transaction.invitation?.id).toBe('assignment');
    expect(chain.for).toHaveBeenCalledTimes(2);
    await transaction.attempt(1, now);
    expect(chain.set).toHaveBeenCalledWith({
      tempPasswordAttempts: 1,
      lockedAt: null,
      updatedAt: now,
    });
    await transaction.attempt(5, now);
    expect(chain.set).toHaveBeenCalledWith({
      tempPasswordAttempts: 5,
      lockedAt: now,
      updatedAt: now,
    });
    await transaction.activate('protected-permanent-hash', now);
    // CHG-029: activation grants full branch access in the same transaction.
    expect(grantFullBranchAccess).toHaveBeenCalledWith(database, {
      assignmentId: 'assignment',
      branchId: 'branch',
      managerUserId: 'actor',
      now,
    });
    expect(chain.set).toHaveBeenCalledWith({
      passwordHash: 'protected-permanent-hash',
      updatedAt: now,
    });
    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'active',
        activatedAt: now,
        tempPasswordHash: null,
        tempPasswordExpiresAt: null,
      }),
    );
    expect(chain.set).toHaveBeenCalledWith({ revokedAt: now, revokedReason: 'manager_activation' });
  });
});
it('SEC: missing identity, missing assignment and archived scope cannot mutate credentials', async () => {
  chain.for.mockReset().mockResolvedValue([]);
  await repository().transaction('missing', async (transaction) => {
    expect(transaction.identity).toBeUndefined();
    await transaction.attempt(1, new Date());
    await transaction.activate('hash', new Date());
  });
  chain.for
    .mockResolvedValueOnce([{ id: 'actor', accountStatus: 'active', passwordHash: null }])
    .mockResolvedValueOnce([]);
  await repository().transaction('missing-assignment', async (transaction) => {
    expect(transaction.invitation).toBeUndefined();
    await transaction.attempt(1, new Date());
    await transaction.activate('hash', new Date());
  });
  chain.for
    .mockResolvedValueOnce([{ id: 'actor', accountStatus: 'active', passwordHash: null }])
    .mockResolvedValueOnce([invitation]);
  chain.limit.mockResolvedValue([]);
  await repository().transaction('archived-branch', async (transaction) => {
    expect(transaction.invitation).toBeUndefined();
    await transaction.activate('hash', new Date());
  });
  expect(database.update).not.toHaveBeenCalled();
});

it('SEC-001/AUTH-M-003: an invitation cannot activate a manager in an archived brand', async () => {
  await repository().transaction('+923001234567', async () => undefined);
  const predicates = chain.where.mock.calls.map((call) => call[0] as SQL);
  expect(
    predicates.some((predicate) =>
      new PgDialect().sqlToQuery(predicate).sql.includes('"brands"."archived_at" is null'),
    ),
  ).toBe(true);
});

it('CHG-006 SEC: the locked repository refuses password replacement for an existing permanent identity', async () => {
  chain.for
    .mockReset()
    .mockResolvedValueOnce([
      { id: 'actor', accountStatus: 'active', passwordHash: 'existing-hash' },
    ])
    .mockResolvedValueOnce([invitation]);
  await expect(
    repository().transaction('+923001234567', async (transaction) => {
      await transaction.activate('replacement-hash', new Date());
    }),
  ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  expect(database.update).not.toHaveBeenCalled();
});
