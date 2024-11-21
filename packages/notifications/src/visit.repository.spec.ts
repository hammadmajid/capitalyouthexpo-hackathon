import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import {
  branches,
  managerAssignments,
  notificationOutbox,
  visitHistory,
  visitInterestResponses,
  type Database,
} from '@hsm/db';
import {
  NotificationRepository,
  InvalidNotificationJob,
  type NotificationTransaction,
  type VisitLifecycleLease,
} from './index.js';
const now = new Date('2026-10-22T03:00:00Z');
const customerId = randomUUID(),
  ownerId = randomUUID(),
  managerId = randomUUID(),
  branchId = randomUUID();
const lease: VisitLifecycleLease = {
  id: randomUUID(),
  eventType: 'visit.lifecycle',
  channel: 'in_app',
  recipientUserId: null,
  payload: { event: 'visit.changed', visitId: randomUUID(), historyId: randomUUID() },
  leaseToken: randomUUID(),
  leaseExpiresAt: new Date(now.getTime() + 60000),
};
function fixture(input = lease, patch: Partial<typeof notificationOutbox.$inferSelect> = {}) {
  let clock = now,
    expiryOnInsert = false;
  const row = { ...input, status: 'pending', ...patch };
  const data = new Map<unknown, unknown[]>([
    [notificationOutbox, [row]],
    [
      visitHistory,
      [
        {
          customerUserId: customerId,
          branchId,
          status: 'completed',
          action: 'complete',
          followUpSentAt: now,
        },
      ],
    ],
    [branches, [{ id: ownerId }]],
    [managerAssignments, [{ id: managerId }, { id: ownerId }]],
  ]);
  const writes: { table: unknown; value: unknown }[] = [],
    locks: unknown[] = [],
    joins: unknown[][] = [];
  function select() {
    let table: unknown;
    const chain = {
      from(value: unknown) {
        table = value;
        return chain;
      },
      innerJoin(...args: unknown[]) {
        joins.push(args);
        return chain;
      },
      where() {
        return chain;
      },
      limit() {
        return chain;
      },
      for() {
        locks.push(table);
        return chain;
      },
      then(resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) {
        return Promise.resolve(data.get(table) ?? []).then(resolve, reject);
      },
    };
    return chain;
  }
  const set = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
  const conflict = vi.fn(async () => {
    if (expiryOnInsert) clock = input.leaseExpiresAt;
  });
  const tx = {
    select,
    update: () => ({ set }),
    insert: (table: unknown) => ({
      values: (value: unknown) => {
        writes.push({ table, value });
        return { onConflictDoNothing: conflict };
      },
    }),
  } as unknown as NotificationTransaction;
  const db = {
    transaction: (work: (value: NotificationTransaction) => Promise<boolean>) => work(tx),
  } as unknown as Database;
  return {
    data,
    writes,
    locks,
    joins,
    set,
    repository: new NotificationRepository(db, () => clock),
    expireAfterInsert() {
      expiryOnInsert = true;
    },
  };
}
it('VISIT-001 / NTF-002: source-bound lifecycle fans out once per live role recipient and acknowledges atomically', async () => {
  const f = fixture();
  expect(await f.repository.publishVisit(lease, now)).toBe(true);
  expect(f.locks).toEqual([notificationOutbox]);
  expect(f.joins[0]).toHaveLength(2);
  expect(f.writes).toHaveLength(3);
  expect(f.writes.map((write) => write.value)).toEqual(
    [customerId, ownerId, managerId].sort().map((recipientUserId) =>
      expect.objectContaining({
        recipientUserId,
        payload: { event: 'visit.changed', operationId: lease.payload.historyId },
      }),
    ),
  );
  expect(f.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent', leaseToken: null }));
});
it('VISIT-001: post-visit prompt goes only to its customer with immutable completion proof', async () => {
  const input = { ...lease, payload: { ...lease.payload, event: 'visit.follow_up' as const } },
    f = fixture(input);
  expect(await f.repository.publishVisit(input, now)).toBe(true);
  expect(f.writes).toHaveLength(1);
  expect(f.writes[0]?.value).toMatchObject({
    recipientUserId: customerId,
    payload: { event: 'visit.follow_up', operationId: input.payload.historyId },
  });
});
it.each([
  { status: 'sent' as const },
  { status: 'dead' as const },
  { leaseToken: randomUUID() },
  { leaseExpiresAt: null },
  { leaseExpiresAt: now },
  { eventType: 'other' },
  { channel: 'email' as const },
  { recipientUserId: customerId },
  { payload: {} },
  { payload: { ...lease.payload, visitId: randomUUID() } },
  { payload: { ...lease.payload, historyId: randomUUID() } },
  { payload: { ...lease.payload, event: 'visit.follow_up' } },
])('VISIT-001: invalid or stale persisted leases cannot fan out', async (patch) => {
  const f = fixture(lease, patch);
  expect(await f.repository.publishVisit(lease, now)).toBe(false);
  expect(f.writes).toHaveLength(0);
  expect(f.set).not.toHaveBeenCalled();
});
it.each([notificationOutbox, visitHistory, branches])(
  'VISIT-001: missing delivery source fails closed',
  async (table) => {
    const f = fixture();
    f.data.set(table, []);
    if (table === notificationOutbox)
      expect(await f.repository.publishVisit(lease, now)).toBe(false);
    else
      await expect(f.repository.publishVisit(lease, now)).rejects.toBeInstanceOf(
        InvalidNotificationJob,
      );
    expect(f.writes).toHaveLength(0);
  },
);
it('VISIT-001: a fabricated follow-up without a marker and completion history is rejected', async () => {
  const input = { ...lease, payload: { ...lease.payload, event: 'visit.follow_up' as const } },
    f = fixture(input);
  f.data.set(visitHistory, [
    {
      customerUserId: customerId,
      branchId,
      status: 'requested',
      action: 'request',
      followUpSentAt: null,
    },
  ]);
  await expect(f.repository.publishVisit(input, now)).rejects.toBeInstanceOf(
    InvalidNotificationJob,
  );
  expect(f.writes).toHaveLength(0);
});
it('VISIT-001: lease expiry during recipient inserts prevents acknowledgement', async () => {
  const f = fixture();
  f.expireAfterInsert();
  await expect(f.repository.publishVisit(lease, now)).rejects.toThrow('lease expired');
  expect(f.set).not.toHaveBeenCalled();
});

it('VISIT-001: a completed visit answered before fanout receives no redundant prompt', async () => {
  const input = { ...lease, payload: { ...lease.payload, event: 'visit.follow_up' as const } },
    f = fixture(input);
  f.data.set(visitInterestResponses, [{ id: randomUUID() }]);
  expect(await f.repository.publishVisit(input, now)).toBe(true);
  expect(f.writes).toHaveLength(0);
  expect(f.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent' }));
});
