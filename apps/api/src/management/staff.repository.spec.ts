import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Database } from '@hsm/db';
import { AuditWriter } from '../audit/writer.js';
import { StaffRepository } from './staff.repository.js';
const mocks = vi.hoisted(() => ({ lock: vi.fn(), branch: vi.fn() }));
vi.mock('./identity-lock.js', () => ({ lockParticipants: mocks.lock }));
vi.mock('../authorization/repository.js', () => ({
  ScopeRepository: class {
    branch = mocks.branch;
  },
}));
const actor = { userId: randomUUID(), sessionId: randomUUID() };
const branchId = randomUUID(),
  assignmentId = randomUUID(),
  targetId = randomUUID();
const now = new Date();
const assignment = { id: assignmentId, userId: targetId, branchId, status: 'active' };
let results: unknown[][];
function query(select = false) {
  const value = {
    from: vi.fn(),
    where: vi.fn(),
    for: vi.fn(),
    set: vi.fn(),
    values: vi.fn(),
    onConflictDoNothing: vi.fn(),
    then: (resolve: (data: unknown[]) => unknown, reject: (error: unknown) => unknown) =>
      Promise.resolve(select ? (results.shift() ?? []) : []).then(resolve, reject),
  };
  for (const method of ['from', 'where', 'set', 'values'] as const)
    value[method].mockReturnValue(value);
  value.for.mockImplementation(() => Promise.resolve(results.shift() ?? []));
  value.onConflictDoNothing.mockResolvedValue(undefined);
  return value;
}
const write = query();
const database = {
  select: vi.fn(() => query(true)),
  update: vi.fn(() => write),
  insert: vi.fn(() => write),
  transaction: vi.fn(),
};
const audit = new AuditWriter();
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(audit, 'hostel').mockResolvedValue(undefined);
  mocks.lock.mockResolvedValue(undefined);
  mocks.branch.mockResolvedValue(true);
  results = [[{ userId: targetId }], [assignment], [{ organizationId: randomUUID() }]];
  database.transaction.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) =>
    work(database),
  );
});
const repository = (clock: () => Date = () => now) =>
  new StaffRepository(database as unknown as Database, clock, audit);
it.each(['suspend', 'deactivate'] as const)(
  'MGR-004: %s locks actors, rechecks scope and persists revocation with audit and outbox',
  async (action) => {
    const result = await repository().transition(actor, branchId, assignmentId, action, 'Reason');
    expect(result.status).toBe(action === 'suspend' ? 'suspended' : 'deactivated');
    expect(mocks.lock).toHaveBeenCalledWith(database, actor, targetId, expect.any(Function));
    expect(mocks.branch).toHaveBeenCalledWith(actor.userId, branchId, true);
    expect(database.update).toHaveBeenCalledTimes(2);
    expect(write.set).toHaveBeenCalledWith(
      expect.objectContaining({ revokedReason: 'manager_' + action }),
    );
    expect(audit.hostel).toHaveBeenCalledWith(
      database,
      expect.objectContaining({ actorUserId: actor.userId, targetId: assignmentId, branchId }),
    );
    expect(write.values).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'in_app', recipientUserId: targetId }),
    );
  },
);
it('MGR-004: reinstatement clears suspension and produces a transactional notice', async () => {
  results[1] = [{ ...assignment, status: 'suspended' }];
  expect(
    (await repository().transition(actor, branchId, assignmentId, 'reinstate', null)).status,
  ).toBe('active');
  expect(write.set).toHaveBeenCalledWith(expect.objectContaining({ suspendedAt: null }));
  expect(database.update).toHaveBeenCalledOnce();
});
it('MGR-004: repeated state is a no-op without another audit or notice', async () => {
  results[1] = [{ ...assignment, status: 'suspended' }];
  await repository().transition(actor, branchId, assignmentId, 'suspend', 'Repeated');
  expect(database.update).not.toHaveBeenCalled();
  expect(audit.hostel).not.toHaveBeenCalled();
  expect(database.insert).not.toHaveBeenCalled();
});
it.each([0, 1, 2])('SEC-001: missing lookup at stage %s rejects safely', async (stage) => {
  results[stage] = [];
  await expect(
    repository().transition(actor, branchId, assignmentId, 'suspend', 'Reason'),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
it('SEC-001: changed ownership prevents writes after participant locks', async () => {
  mocks.branch.mockResolvedValue(false);
  await expect(
    repository().transition(actor, branchId, assignmentId, 'suspend', 'Reason'),
  ).rejects.toMatchObject({ code: 'BRANCH_FORBIDDEN' });
  expect(database.update).not.toHaveBeenCalled();
});
it('ACC-006: audit error propagates before outbox publication', async () => {
  vi.mocked(audit.hostel).mockRejectedValue(new Error('Audit failed'));
  await expect(
    repository().transition(actor, branchId, assignmentId, 'suspend', 'Reason'),
  ).rejects.toThrow('Audit failed');
  expect(database.insert).not.toHaveBeenCalled();
});
