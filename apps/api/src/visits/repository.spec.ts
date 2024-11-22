import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  branches,
  visitInterestResponses,
  notificationOutbox,
  visitHistory,
  visitRequests,
  visitingHours,
} from '@hsm/db';
import type { VisitCommand } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { AuditWriter } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import {
  authorizeVisitBranch,
  authorizeVisitCustomer,
  lockVisit,
  lockVisitListing,
  publicVisitBranchId,
} from './access.js';
import { readVisitHours, readVisitPage } from './state.js';
import { VisitRepository } from './repository.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('./access.js', () => ({
  authorizeVisitBranch: vi.fn(),
  authorizeVisitCustomer: vi.fn(),
  lockVisit: vi.fn(),
  lockVisitListing: vi.fn(),
  publicVisitBranchId: vi.fn(),
}));
vi.mock('./state.js', async (original) => ({
  ...(await original<typeof import('./state.js')>()),
  readVisitHours: vi.fn(),
  readVisitPage: vi.fn(),
}));
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  branchId = randomUUID(),
  visitId = randomUUID();
const now = new Date('2026-10-22T03:00:00Z'),
  start = new Date('2026-11-05T05:00:00Z');
const hours = {
  branchId,
  version: 'a'.repeat(64),
  windows: [{ dayOfWeek: 4, opensAt: '09:00', closesAt: '17:00' }],
};
function visit(
  patch: Partial<typeof visitRequests.$inferSelect> = {},
): typeof visitRequests.$inferSelect {
  return {
    id: visitId,
    branchId,
    customerUserId: actor.userId,
    requestedStart: start,
    proposedStart: null,
    status: 'requested',
    decidedByUserId: null,
    reason: null,
    followUpSentAt: null,
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}
function fixture(clock = () => now) {
  const store = queryFixture(),
    audit = new AuditWriter(),
    audited = vi.spyOn(audit, 'hostel').mockResolvedValue(undefined);
  return { store, audit, audited, repository: new VisitRepository(store.database, audit, clock) };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readVisitHours).mockResolvedValue(hours);
  vi.mocked(publicVisitBranchId).mockResolvedValue(branchId);
  vi.mocked(lockVisit).mockResolvedValue(visit());
  vi.mocked(authorizeVisitBranch).mockResolvedValue({
    organizationId: randomUUID(),
    brandId: randomUUID(),
    ownerId: actor.userId,
    actorRole: 'owner',
  });
});
it('VISIT-001: new request validates hours, then writes a request, immutable history and recipient-free outbox', async () => {
  const f = fixture();
  f.store.enqueue(visitRequests, [], [visit()]);
  expect(
    (await f.repository.create(f.store.transaction, actor, branchId, start.toISOString())).status,
  ).toBe('requested');
  expect(lockVisitListing).toHaveBeenCalledWith(f.store.transaction, branchId);
  expect(lockActor).toHaveBeenCalledWith(f.store.transaction, actor, expect.any(Function));
  expect(f.store.writes).toContainEqual(
    expect.objectContaining({
      table: visitHistory,
      value: expect.objectContaining({
        visitId,
        branchId,
        actorUserId: actor.userId,
        action: 'request',
        requestedStart: start,
      }),
    }),
  );
  expect(f.store.writes).toContainEqual(
    expect.objectContaining({
      table: notificationOutbox,
      value: expect.objectContaining({
        eventType: 'visit.lifecycle',
        recipientUserId: null,
        payload: expect.objectContaining({ visitId, event: 'visit.changed' }),
      }),
    }),
  );
});
it('VISIT-001: no hours, duplicate or missing returning row cannot acknowledge success', async () => {
  const f = fixture();
  vi.mocked(readVisitHours).mockResolvedValueOnce({ ...hours, windows: [] });
  await expect(
    f.repository.create(f.store.transaction, actor, branchId, start.toISOString()),
  ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  expect(f.store.writes).toHaveLength(0);
  f.store.enqueue(visitRequests, [{ id: visitId }]);
  await expect(
    f.repository.create(f.store.transaction, actor, branchId, start.toISOString()),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  f.store.enqueue(visitRequests, [], []);
  await expect(
    f.repository.create(f.store.transaction, actor, branchId, start.toISOString()),
  ).rejects.toThrow('Visit write unavailable');
});
it.each(['branch', 'own'] as const)(
  'VISIT-001 / SEC-003: %s authorization rechecks live actor and child scope',
  async (kind) => {
    const f = fixture(),
      branch = kind === 'branch' ? branchId : undefined;
    expect(await f.repository.authorize(f.store.transaction, actor, branch, visitId)).toBe(true);
    expect(lockVisit).toHaveBeenCalledWith(
      f.store.transaction,
      visitId,
      branch ? { branchId } : { customerUserId: actor.userId },
    );
    if (branch) expect(authorizeVisitBranch).toHaveBeenCalled();
    else expect(authorizeVisitCustomer).toHaveBeenCalled();
    expect(lockActor).toHaveBeenCalled();
  },
);
it('VISIT-001: read methods retain exact source scope and selected local weekday', async () => {
  const f = fixture();
  vi.mocked(readVisitPage).mockResolvedValue({ data: [], nextCursor: null });
  expect(await f.repository.hours(actor, branchId)).toEqual(hours);
  expect(await f.repository.publicHours('real-hostel', '2026-11-05')).toEqual({
    branchId,
    date: '2026-11-05',
    windows: hours.windows,
  });
  expect(await f.repository.publicHours('real-hostel', '2026-11-06')).toEqual({
    branchId,
    date: '2026-11-06',
    windows: [],
  });
  await f.repository.list(actor, { limit: 20 });
  expect(readVisitPage).toHaveBeenLastCalledWith(
    f.store.transaction,
    { customerUserId: actor.userId },
    { limit: 20 },
  );
  await f.repository.list(actor, { limit: 20 }, branchId);
  expect(readVisitPage).toHaveBeenLastCalledWith(f.store.transaction, { branchId }, { limit: 20 });
});
it('VISIT-001 / ACC-006: versioned schedule replacement audits before/after and rejects stale edits', async () => {
  const f = fixture();
  await expect(
    f.repository.saveHours(f.store.transaction, actor, branchId, {
      expectedVersion: 'b'.repeat(64),
      windows: [],
    }),
  ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  expect(f.store.operations).not.toContainEqual(expect.objectContaining({ kind: 'delete' }));
  await f.repository.saveHours(f.store.transaction, actor, branchId, {
    expectedVersion: hours.version,
    windows: hours.windows,
  });
  expect(f.store.operations).toContainEqual({ table: visitingHours, kind: 'delete', args: [] });
  expect(f.store.writes).toContainEqual({
    table: visitingHours,
    kind: 'insert',
    value: hours.windows.map((window) => ({ ...window, branchId })),
  });
  expect(f.audited).toHaveBeenCalledWith(
    f.store.transaction,
    expect.objectContaining({
      action: 'visit.hours.changed',
      branchId,
      before: hours,
      after: hours,
    }),
  );
});
it('VISIT-001: deliberate empty schedule makes no fabricated insert', async () => {
  const f = fixture();
  await f.repository.saveHours(f.store.transaction, actor, branchId, {
    expectedVersion: hours.version,
    windows: [],
  });
  expect(f.store.writes.filter((write) => write.table === visitingHours)).toHaveLength(0);
});
function command(action: VisitCommand['action']): VisitCommand {
  if (action === 'reschedule')
    return { action, proposedStart: '2026-11-05T06:00:00Z', note: 'New time' };
  if (action === 'reject') return { action, reason: 'Unavailable' };
  return { action };
}
it.each([
  'approve',
  'reschedule',
  'reject',
  'cancel',
  'accept-reschedule',
  'complete',
  'no-show',
] as const)(
  'VISIT-001: %s writes correlated state/history/outbox with monotonic update time',
  async (action) => {
    const completed = action === 'complete' || action === 'no-show',
      own = action === 'cancel' || action === 'accept-reschedule';
    const before = visit(
      action === 'accept-reschedule'
        ? { status: 'rescheduled', proposedStart: new Date('2026-11-05T06:00:00Z') }
        : completed
          ? { status: 'approved' }
          : {},
    );
    vi.mocked(lockVisit).mockResolvedValue(before);
    const status =
      action === 'reschedule'
        ? 'rescheduled'
        : action === 'reject'
          ? 'rejected'
          : action === 'cancel'
            ? 'cancelled'
            : action === 'complete'
              ? 'completed'
              : action === 'no-show'
                ? 'no_show'
                : 'approved';
    const clock = completed ? new Date('2026-11-05T06:00:00Z') : now;
    const after = visit({
      status,
      updatedAt: new Date(Math.max(clock.getTime(), now.getTime() + 1)),
      proposedStart: action === 'reschedule' ? new Date('2026-11-05T06:00:00Z') : null,
      requestedStart: action === 'accept-reschedule' ? new Date('2026-11-05T06:00:00Z') : start,
    });
    const f = fixture(() => clock);
    if (action === 'accept-reschedule') f.store.enqueue(visitRequests, []);
    f.store.enqueue(visitRequests, [after]);
    const result = await f.repository.action(
      f.store.transaction,
      actor,
      visitId,
      { expectedUpdatedAt: before.updatedAt.toISOString(), command: command(action) },
      own ? undefined : branchId,
    );
    expect(result.status).toBe(status);
    expect(f.store.writes).toContainEqual(
      expect.objectContaining({
        table: visitHistory,
        value: expect.objectContaining({ action, status, requestedStart: after.requestedStart }),
      }),
    );
    expect(f.store.writes.filter((write) => write.table === notificationOutbox)).toHaveLength(1);
    expect(f.audited).toHaveBeenCalledTimes(own ? 0 : 1);
  },
);
it('VISIT-001: stale reviewed marker or wrong actor context cannot mutate state', async () => {
  const f = fixture();
  await expect(
    f.repository.action(f.store.transaction, actor, visitId, {
      expectedUpdatedAt: '2026-10-21T03:00:00Z',
      command: { action: 'cancel' },
    }),
  ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  await expect(
    f.repository.action(f.store.transaction, actor, visitId, {
      expectedUpdatedAt: now.toISOString(),
      command: { action: 'approve' },
    }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(
    f.repository.action(
      f.store.transaction,
      actor,
      visitId,
      { expectedUpdatedAt: now.toISOString(), command: { action: 'cancel' } },
      branchId,
    ),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(f.store.writes).toHaveLength(0);
});
it('VISIT-001: missing update row or required audit failure propagates to the caller transaction', async () => {
  const f = fixture();
  f.store.enqueue(visitRequests, []);
  await expect(
    f.repository.action(
      f.store.transaction,
      actor,
      visitId,
      { expectedUpdatedAt: now.toISOString(), command: { action: 'approve' } },
      branchId,
    ),
  ).rejects.toThrow('Visit transition unavailable');
  f.store.enqueue(visitRequests, [visit({ status: 'approved' })]);
  f.audited.mockRejectedValue(new Error('Audit unavailable'));
  await expect(
    f.repository.action(
      f.store.transaction,
      actor,
      visitId,
      { expectedUpdatedAt: now.toISOString(), command: { action: 'approve' } },
      branchId,
    ),
  ).rejects.toThrow('Audit unavailable');
});

it('VISIT-001 / ACC-002: history rechecks live scope and session after waiting for the exact child lock', async () => {
  const f = fixture();
  f.store.enqueue(branches, [{ branchName: 'Hostel', customerName: 'Customer' }]);
  f.store.enqueue(visitHistory, []);
  const result = await f.repository.historyPage(actor, visitId, { limit: 20 }, branchId);
  expect(result.visitId).toBe(visitId);
  expect(authorizeVisitBranch).toHaveBeenCalledWith(
    f.store.transaction,
    actor,
    branchId,
    expect.any(Function),
  );
  expect(lockVisit).toHaveBeenCalledWith(f.store.transaction, visitId, { branchId });
  expect(lockActor).toHaveBeenCalled();
  vi.mocked(lockVisit).mockRejectedValueOnce(new Error('Foreign child denied'));
  await expect(f.repository.historyPage(actor, visitId, { limit: 20 })).rejects.toThrow(
    'Foreign child denied',
  );
  expect(lockVisit).toHaveBeenLastCalledWith(f.store.transaction, visitId, {
    customerUserId: actor.userId,
  });
});

it('VISIT-001 / ACC-002: interest reads and writes bind the current own child and live actor', async () => {
  const f = fixture(),
    completed = visit({ status: 'completed' });
  vi.mocked(lockVisit).mockResolvedValue(completed);
  const read = await f.repository.interest(actor, visitId, branchId);
  expect(read.stillInterested).toBeNull();
  expect(lockVisit).toHaveBeenLastCalledWith(f.store.transaction, visitId, { branchId });
  f.store.enqueue(visitRequests, [{ ...completed, updatedAt: new Date(now.getTime() + 1) }]);
  f.store.enqueue(visitInterestResponses, [], [{ stillInterested: false, createdAt: now }]);
  const result = await f.repository.recordInterest(f.store.transaction, actor, visitId, {
    expectedUpdatedAt: now.toISOString(),
    stillInterested: false,
  });
  expect(result.stillInterested).toBe(false);
  expect(lockVisit).toHaveBeenLastCalledWith(f.store.transaction, visitId, {
    customerUserId: actor.userId,
  });
  expect(lockActor).toHaveBeenCalledWith(f.store.transaction, actor, expect.any(Function));
});

it('VISIT-001: accepting a proposed time occupied by another active own visit returns a typed conflict before writes', async () => {
  const f = fixture();
  const proposed = new Date('2026-11-05T06:00:00Z');
  vi.mocked(lockVisit).mockResolvedValue(visit({ status: 'rescheduled', proposedStart: proposed }));
  f.store.enqueue(visitRequests, [{ id: randomUUID() }]);
  await expect(
    f.repository.action(f.store.transaction, actor, visitId, {
      expectedUpdatedAt: now.toISOString(),
      command: { action: 'accept-reschedule' },
    }),
  ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
  expect(f.store.writes).toHaveLength(0);
});
