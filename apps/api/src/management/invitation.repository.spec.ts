import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { managerAssignments, users, type Database } from '@hsm/db';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { lockParticipants } from './identity-lock.js';
import { lockInvitationBranch } from './invitation.scope.js';
import { InvitationRepository } from './invitation.repository.js';
vi.mock('./identity-lock.js', () => ({ lockParticipants: vi.fn() }));
vi.mock('./invitation.scope.js', () => ({ lockInvitationBranch: vi.fn() }));
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  branchId = randomUUID(),
  targetId = randomUUID(),
  assignmentId = randomUUID();
const now = new Date('2026-10-11T00:00:00Z'),
  organizationId = randomUUID();
const input = {
  fullName: 'New Manager',
  phone: '+923001234567',
  temporaryCredential: { mode: 'auto' as const },
};
const identity = {
  id: targetId,
  fullName: 'Existing Customer',
  phoneE164: input.phone,
  accountStatus: 'active',
  passwordHash: null,
};
const assignment = { id: assignmentId, userId: targetId, branchId, status: 'pending_activation' };
let selections: unknown[][], insertions: unknown[][];
const selectChain = { from: vi.fn(), where: vi.fn(), for: vi.fn(), then: vi.fn() };
const writeChain = {
  values: vi.fn(),
  onConflictDoNothing: vi.fn(),
  returning: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  then: vi.fn(),
};
const database = { select: vi.fn(), insert: vi.fn(), update: vi.fn(), transaction: vi.fn() };
const transaction = database as unknown as Transaction;
const audit = new AuditWriter(),
  record = vi.spyOn(audit, 'hostel');
const repository = () => new InvitationRepository(database as unknown as Database, audit);
const invite = () =>
  repository().invite(transaction, actor, branchId, targetId, input, 'argon2-hash', now);
beforeEach(() => {
  vi.clearAllMocks();
  selections = [];
  insertions = [[{ id: targetId }], [{ id: assignmentId }]];
  database.select.mockReturnValue(selectChain);
  for (const key of ['from', 'where'] as const) selectChain[key].mockReturnValue(selectChain);
  selectChain.for.mockImplementation(async () => selections.shift() ?? []);
  selectChain.then.mockImplementation((resolve: (rows: unknown[]) => unknown) =>
    Promise.resolve(selections.shift() ?? []).then(resolve),
  );
  database.insert.mockReturnValue(writeChain);
  database.update.mockReturnValue(writeChain);
  for (const key of ['values', 'onConflictDoNothing', 'set', 'where'] as const)
    writeChain[key].mockReturnValue(writeChain);
  writeChain.returning.mockImplementation(async () => insertions.shift() ?? []);
  writeChain.then.mockImplementation((resolve: (value: undefined) => unknown) =>
    Promise.resolve(undefined).then(resolve),
  );
  database.transaction.mockImplementation(async (work: (db: Transaction) => Promise<unknown>) =>
    work(transaction),
  );
  vi.mocked(lockParticipants).mockResolvedValue(undefined);
  vi.mocked(lockInvitationBranch).mockResolvedValue(organizationId);
  record.mockResolvedValue(undefined);
});
it('AUTH-M-001: phone resolution reuses identity or allocates a fresh UUID without writing', async () => {
  selections = [[{ id: targetId }], []];
  expect(await repository().resolve(input.phone)).toBe(targetId);
  expect(await repository().resolve(input.phone)).toMatch(/^[a-f0-9-]{36}$/);
  expect(database.insert).not.toHaveBeenCalled();
});
it('SEC: reset resolves an immutable assignment identity and hides absent branch objects', async () => {
  selections = [[{ userId: targetId }], []];
  expect(await repository().resolveAssignment(branchId, assignmentId)).toBe(targetId);
  await expect(repository().resolveAssignment(branchId, assignmentId)).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
});
it('SEC: idempotency participant locks and exact branch scope run before work', async () => {
  const work = vi.fn().mockResolvedValue('result');
  expect(await repository().store(targetId).transaction(actor, now, work)).toBe('result');
  expect(lockParticipants).toHaveBeenCalledWith(transaction, actor, targetId, expect.any(Function));
  const clock = vi.mocked(lockParticipants).mock.calls[0]?.[3];
  expect(clock?.()).toBe(now);
  expect(vi.mocked(lockParticipants).mock.invocationCallOrder[0]).toBeLessThan(
    work.mock.invocationCallOrder[0] ?? 0,
  );
  expect(await repository().authorize(transaction, actor, branchId)).toBe(true);
  expect(lockInvitationBranch).toHaveBeenCalledWith(transaction, actor, branchId);
});
it('AUTH-M-001 SEC: creation stores only a credential hash with unverified phone and null permanent password defaults', async () => {
  selections = [[], []];
  const state = await invite();
  expect(database.insert.mock.calls.map(([table]) => table)).toEqual([users, managerAssignments]);
  expect(writeChain.values.mock.calls[0]?.[0]).toEqual({
    id: targetId,
    fullName: input.fullName,
    phoneE164: input.phone,
    createdAt: now,
    updatedAt: now,
  });
  expect(writeChain.values.mock.calls[1]?.[0]).toMatchObject({
    userId: targetId,
    branchId,
    appointedByUserId: actor.userId,
    tempPasswordHash: 'argon2-hash',
    tempPasswordExpiresAt: new Date(state.expiresAt),
  });
  expect(state.acceptance).toBe('temporary_password');
  expect(record).toHaveBeenCalledWith(
    transaction,
    expect.objectContaining({
      action: 'manager.invited',
      organizationId,
      branchId,
      after: {
        status: 'pending_activation',
        acceptance: 'temporary_password',
        expiresAt: state.expiresAt,
      },
    }),
  );
  expect(JSON.stringify(record.mock.calls)).not.toContain(input.phone);
  expect(JSON.stringify(record.mock.calls)).not.toContain(input.fullName);
});
it.each([null, 'existing-permanent-hash'])(
  'SEC: existing identity password %s and other capabilities are never overwritten',
  async (passwordHash) => {
    selections = [[{ ...identity, passwordHash }], []];
    const state = await invite();
    expect(database.insert).toHaveBeenCalledTimes(1);
    expect(database.insert).toHaveBeenCalledWith(managerAssignments);
    expect(database.update).not.toHaveBeenCalled();
    expect(writeChain.values.mock.calls[0]?.[0].tempPasswordHash).toBe(
      passwordHash ? null : 'argon2-hash',
    );
    expect(state.acceptance).toBe(passwordHash ? 'authenticated_account' : 'temporary_password');
  },
);
it('ACC-006: concurrent identity creation conflict cannot create a partial assignment', async () => {
  selections = [[]];
  insertions = [[]];
  await expect(invite()).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(database.insert).toHaveBeenCalledTimes(1);
  expect(record).not.toHaveBeenCalled();
});
it('SEC: changed phone mapping or inactive account rejects before writes', async () => {
  for (const patch of [{ id: randomUUID() }, { accountStatus: 'banned' }]) {
    selections = [[{ ...identity, ...patch }]];
    await expect(invite()).rejects.toMatchObject({ code: 'CONFLICT' });
  }
  expect(database.insert).not.toHaveBeenCalled();
});
it('ACC-006: a live or concurrently inserted assignment prevents double appointment', async () => {
  selections = [[identity], [{ id: assignmentId }]];
  await expect(invite()).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(database.insert).not.toHaveBeenCalled();
  selections = [[identity], []];
  insertions = [[]];
  await expect(invite()).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(record).not.toHaveBeenCalled();
});
it('AUTH-M-003: pending locked reset clears attempts and replaces only temporary credentials', async () => {
  selections = [[{ ...assignment, lockedAt: now, tempPasswordAttempts: 5 }], [identity]];
  const state = await repository().reset(
    transaction,
    actor,
    branchId,
    assignmentId,
    targetId,
    'replacement-hash',
    now,
  );
  expect(state.id).toBe(assignmentId);
  expect(database.update).toHaveBeenCalledWith(managerAssignments);
  expect(writeChain.set).toHaveBeenCalledWith({
    tempPasswordHash: 'replacement-hash',
    tempPasswordExpiresAt: new Date(state.expiresAt),
    tempPasswordAttempts: 0,
    lockedAt: null,
    updatedAt: now,
  });
  expect(record).toHaveBeenCalledWith(
    transaction,
    expect.objectContaining({ action: 'manager.temporary_password_reset' }),
  );
});
it.each([
  [[], [identity]],
  [[{ ...assignment, userId: randomUUID() }], [identity]],
  [[assignment], []],
])(
  'SEC: reset rejects missing, foreign or changed assignment identity',
  async (assignmentRows, identityRows) => {
    selections = [assignmentRows, identityRows];
    await expect(
      repository().requireReset(transaction, branchId, assignmentId, targetId),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(database.update).not.toHaveBeenCalled();
  },
);
it.each([{ passwordHash: 'permanent-hash' }, { phoneE164: null }, { accountStatus: 'suspended' }])(
  'SEC: reset never changes a permanent or unavailable identity',
  async (patch) => {
    selections = [[assignment], [{ ...identity, ...patch }]];
    await expect(
      repository().requireReset(transaction, branchId, assignmentId, targetId),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  },
);
it('SEC ACC-006: audit failure propagates inside the caller transaction', async () => {
  selections = [[identity], []];
  record.mockRejectedValueOnce(new Error('Audit failure'));
  await expect(invite()).rejects.toThrow('Audit failure');
});
