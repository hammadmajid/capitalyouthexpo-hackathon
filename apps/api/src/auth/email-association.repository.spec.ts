import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { users, managerAssignments, type Database } from '@hsm/db';
import { AuditWriter } from '../audit/writer.js';
import { lockActor } from './actor-lock.js';
import { EmailAssociationRepository } from './email-association.repository.js';
vi.mock('./actor-lock.js', () => ({ lockActor: vi.fn() }));
const actor = { userId: randomUUID(), sessionId: randomUUID() };
const now = new Date('2026-10-12T12:00:00Z');
const identity = {
  id: actor.userId,
  email: null,
  emailVerifiedAt: null,
  passwordHash: 'permanent',
  accountStatus: 'active',
};
const database = { select: vi.fn(), update: vi.fn(), insert: vi.fn(), transaction: vi.fn() };
const chain = {
  from: vi.fn(),
  innerJoin: vi.fn(),
  where: vi.fn(),
  for: vi.fn(),
  limit: vi.fn(),
  set: vi.fn(),
  returning: vi.fn(),
  values: vi.fn(),
  onConflictDoNothing: vi.fn(),
};
const audit = new AuditWriter(),
  record = vi.spyOn(audit, 'platform');
let table: unknown, manager: boolean, available: boolean;
beforeEach(() => {
  vi.clearAllMocks();
  manager = true;
  available = true;
  vi.mocked(lockActor).mockResolvedValue(undefined);
  record.mockResolvedValue(undefined);
  database.select.mockReturnValue(chain);
  database.update.mockReturnValue(chain);
  database.insert.mockReturnValue(chain);
  chain.from.mockImplementation((value: unknown) => {
    table = value;
    return chain;
  });
  for (const method of ['innerJoin', 'where', 'set', 'values'] as const)
    chain[method].mockReturnValue(chain);
  chain.for.mockResolvedValue([identity]);
  chain.returning.mockResolvedValue([{ id: actor.userId }]);
  chain.limit.mockImplementation(async () =>
    table === managerAssignments
      ? manager
        ? [{ id: randomUUID() }]
        : []
      : available
        ? []
        : [{ id: randomUUID() }],
  );
  chain.onConflictDoNothing.mockResolvedValue(undefined);
  database.transaction.mockImplementation(async (work: (value: unknown) => Promise<unknown>) =>
    work(database),
  );
});
const repository = () =>
  new EmailAssociationRepository(database as unknown as Database, audit, () => now);
it('AUTH-M SEC: actor lock precedes the locked same-identity lookup and active Manager scope joins all unarchived parents', async () => {
  await repository().transaction(actor, async (tx) => {
    expect(tx.identity).toEqual(identity);
    expect(await tx.managerAllowed()).toBe(true);
    expect(chain.for).toHaveBeenCalledWith('update');
  });
  expect(vi.mocked(lockActor).mock.invocationCallOrder[0]).toBeLessThan(
    database.select.mock.invocationCallOrder[0] ?? 0,
  );
  const query = new PgDialect().sqlToQuery(chain.where.mock.calls.at(-1)?.[0] as SQL);
  expect(query.params).toEqual([actor.userId, 'active']);
  for (const name of ['branches', 'brands', 'organizations'])
    expect(query.sql).toContain('"' + name + '"."archived_at" is null');
  manager = false;
  await repository().transaction(actor, async (tx) =>
    expect(await tx.managerAllowed()).toBe(false),
  );
});
it('SEC: claimed email is checked without locking another identity or revealing its ID', async () => {
  await repository().transaction(actor, async (tx) => {
    expect(await tx.emailAvailable('new@example.test')).toBe(true);
    available = false;
    expect(await tx.emailAvailable('new@example.test')).toBe(false);
  });
  expect(chain.for).toHaveBeenCalledTimes(1);
  const query = new PgDialect().sqlToQuery(chain.where.mock.calls.at(-1)?.[0] as SQL);
  expect(query.params).toEqual(['new@example.test']);
});
it('AUTH-M AUD-001: binding, verification notice and fixed audit share the original transaction without credential writes', async () => {
  await repository().transaction(actor, (tx) => tx.bindEmail('new@example.test', now));
  expect(database.update).toHaveBeenCalledWith(users);
  expect(chain.set).toHaveBeenCalledWith({ email: 'new@example.test', updatedAt: now });
  expect(chain.set).toHaveBeenCalledWith({ emailVerifiedAt: now, updatedAt: now });
  expect(chain.values).toHaveBeenCalledWith(
    expect.objectContaining({ eventType: 'notification.create', recipientUserId: actor.userId }),
  );
  expect(record).toHaveBeenCalledWith(
    database,
    expect.objectContaining({
      actorUserId: actor.userId,
      actorRole: 'self',
      action: 'auth.email_associated',
      targetId: actor.userId,
      after: { emailVerified: true },
    }),
  );
  expect(JSON.stringify(record.mock.calls)).not.toContain('new@example.test');
  expect(JSON.stringify(chain.set.mock.calls)).not.toContain('password');
  const query = new PgDialect().sqlToQuery(chain.where.mock.calls[1]?.[0] as SQL);
  expect(query.params).toEqual([actor.userId]);
  expect(query.sql).toContain('"email" is null');
});
it('SEC: missing identity is retained as unavailable and a lost conditional bind cannot succeed', async () => {
  chain.for.mockResolvedValue([]);
  await repository().transaction(actor, async (tx) => expect(tx.identity).toBeUndefined());
  chain.returning.mockResolvedValue([]);
  await expect(
    repository().transaction(actor, (tx) => tx.bindEmail('new@example.test', now)),
  ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  expect(record).not.toHaveBeenCalled();
});
it.each(['direct', 'wrapped'] as const)(
  'SEC: %s unique collision becomes an opaque verification error',
  async (kind) => {
    const unique = Object.assign(new Error('private constraint'), { code: '23505' });
    database.transaction.mockRejectedValueOnce(
      kind === 'direct' ? unique : new Error('private query', { cause: unique }),
    );
    await expect(repository().transaction(actor, async () => undefined)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: 'Verification unavailable',
    });
  },
);
it('AUD-001: audit failure propagates so the real transaction rolls back email and OTP consumption', async () => {
  record.mockRejectedValueOnce(new Error('Audit unavailable'));
  await expect(
    repository().transaction(actor, (tx) => tx.bindEmail('new@example.test', now)),
  ).rejects.toThrow('Audit unavailable');
});
