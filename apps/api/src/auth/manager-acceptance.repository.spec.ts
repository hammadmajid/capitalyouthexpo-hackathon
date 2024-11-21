import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { managerAssignments, users, sessions, type Database } from '@hsm/db';
import { AuditWriter } from '../audit/writer.js';
import { lockActor } from './actor-lock.js';
import { ManagerAcceptanceRepository } from './manager-acceptance.repository.js';
import { grantFullBranchAccess } from './manager-full-access.js';
vi.mock('./actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('./manager-full-access.js', () => ({ grantFullBranchAccess: vi.fn() }));
const actor = { userId: randomUUID(), sessionId: randomUUID() };
const now = new Date('2026-10-10T12:00:00Z');
const invitation = {
  id: randomUUID(),
  userId: actor.userId,
  branchId: randomUUID(),
  status: 'pending_activation',
  tempPasswordAttempts: 0,
  lockedAt: null,
  tempPasswordExpiresAt: new Date(now.getTime() + 1000),
};
const organizationId = randomUUID();
const chain = {
  from: vi.fn(),
  where: vi.fn(),
  for: vi.fn(),
  innerJoin: vi.fn(),
  limit: vi.fn(),
  set: vi.fn(),
  then: vi.fn(),
};
const database = { select: vi.fn(), update: vi.fn(), transaction: vi.fn() };
const audit = new AuditWriter(),
  record = vi.spyOn(audit, 'hostel');
const repository = () =>
  new ManagerAcceptanceRepository(database as unknown as Database, audit, () => now);
beforeEach(() => {
  vi.resetAllMocks();
  database.select.mockReturnValue(chain);
  database.update.mockReturnValue(chain);
  for (const method of ['from', 'where', 'innerJoin', 'set'] as const)
    chain[method].mockReturnValue(chain);
  chain.for
    .mockResolvedValueOnce([{ passwordHash: 'permanent-hash' }])
    .mockResolvedValueOnce([invitation]);
  chain.limit.mockResolvedValue([{ organizationId }]);
  chain.then.mockImplementation((resolve: (value: unknown) => unknown) => resolve(undefined));
  database.transaction.mockImplementation(async (work: (value: unknown) => Promise<unknown>) =>
    work(database),
  );
  record.mockResolvedValue(undefined);
  vi.mocked(lockActor).mockResolvedValue(undefined);
});
it('AUTH-M CHG-006 SEC: own locked invitation becomes active with same-transaction audit and no credential or device mutations', async () => {
  await repository().accept(actor);
  expect(lockActor).toHaveBeenCalledWith(database, actor, expect.any(Function));
  expect(vi.mocked(lockActor).mock.invocationCallOrder[0]).toBeLessThan(
    database.select.mock.invocationCallOrder[0] ?? 0,
  );
  expect(database.update).toHaveBeenCalledExactlyOnceWith(managerAssignments);
  // CHG-029: activation grants full branch access in the same transaction.
  expect(grantFullBranchAccess).toHaveBeenCalledWith(
    database,
    expect.objectContaining({ managerUserId: actor.userId }),
    expect.anything(),
  );
  expect(database.update).not.toHaveBeenCalledWith(users);
  expect(database.update).not.toHaveBeenCalledWith(sessions);
  expect(chain.set).toHaveBeenCalledWith({
    status: 'active',
    activatedAt: now,
    updatedAt: now,
    tempPasswordHash: null,
    tempPasswordExpiresAt: null,
    tempPasswordAttempts: 0,
    lockedAt: null,
  });
  expect(record).toHaveBeenCalledWith(
    database,
    expect.objectContaining({
      actorUserId: actor.userId,
      organizationId,
      branchId: invitation.branchId,
      targetId: invitation.id,
      action: 'manager.invitation.accept',
      before: { status: 'pending_activation' },
      after: { status: 'active' },
    }),
  );
  const predicates = chain.where.mock.calls.map((call) =>
    new PgDialect().sqlToQuery(call[0] as SQL),
  );
  expect(predicates[1]?.sql).toContain('"manager_assignments"."user_id"');
  expect(predicates[1]?.params).toContain(actor.userId);
  for (const table of ['branches', 'brands', 'organizations'])
    expect(predicates[2]?.sql).toContain('"' + table + '"."archived_at" is null');
  expect(predicates[3]?.params).toContain(actor.userId);
});
it.each([{ rows: [] }, { rows: [{ passwordHash: null }] }, { rows: [{ passwordHash: '' }] }])(
  'SEC: permanent authentication is mandatory even if a session exists',
  async ({ rows }) => {
    chain.for.mockReset().mockResolvedValueOnce(rows);
    await expect(repository().accept(actor)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(database.update).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  },
);
it('SEC: absent or foreign invitation cannot grant a capability', async () => {
  chain.for
    .mockReset()
    .mockResolvedValueOnce([{ passwordHash: 'permanent' }])
    .mockResolvedValueOnce([]);
  await expect(repository().accept(actor)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(database.update).not.toHaveBeenCalled();
  expect(record).not.toHaveBeenCalled();
});
it('SEC: an archived branch, brand or organization rejects acceptance before writes', async () => {
  chain.limit.mockResolvedValueOnce([]);
  await expect(repository().accept(actor)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(database.update).not.toHaveBeenCalled();
  expect(record).not.toHaveBeenCalled();
});
it('SEC: persisted revocation and audit failure reject the operation', async () => {
  vi.mocked(lockActor).mockRejectedValueOnce(new Error('Session revoked'));
  await expect(repository().accept(actor)).rejects.toThrow('Session revoked');
  expect(database.select).not.toHaveBeenCalled();
  record.mockRejectedValueOnce(new Error('Audit unavailable'));
  await expect(repository().accept(actor)).rejects.toThrow('Audit unavailable');
});
