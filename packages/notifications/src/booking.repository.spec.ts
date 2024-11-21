import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import {
  bookings,
  bookingHistory,
  bookingPaymentProofs,
  bookingUpfrontTerms,
  branches,
  managerAssignments,
  notificationOutbox,
  type Database,
} from '@hsm/db';
import {
  NotificationRepository,
  InvalidNotificationJob,
  type BookingLifecycleLease,
  type NotificationTransaction,
} from './index.js';
const now = new Date('2026-10-16T00:00:00Z'),
  customerId = randomUUID(),
  ownerId = randomUUID(),
  managerId = randomUUID(),
  branchId = randomUUID(),
  proofId = randomUUID();
const stateEvents = [
  'booking.submitted',
  'booking.confirmed',
  'booking.rejected',
  'booking.cancelled',
  'booking.expired',
] as const;
const lease: BookingLifecycleLease = {
  id: randomUUID(),
  eventType: 'booking.lifecycle',
  channel: 'in_app',
  recipientUserId: null,
  payload: { event: 'booking.submitted', bookingId: randomUUID() },
  leaseToken: randomUUID(),
  leaseExpiresAt: new Date(now.getTime() + 60000),
};
type Row = typeof notificationOutbox.$inferSelect;
function fixture(
  change: Partial<Row> = {},
  missing?: 'outbox' | 'booking' | 'history' | 'owner',
  extra: (readonly [unknown, readonly unknown[]])[] = [],
) {
  let clock = now,
    advanceOnLock: Date | undefined,
    advanceOnInsert: Date | undefined;
  const row: Row = {
    ...lease,
    recipientAddress: null,
    dedupeKey: 'fixture',
    status: 'pending',
    attempts: 1,
    nextAttemptAt: now,
    lastError: null,
    providerMessageId: null,
    createdAt: now,
    sentAt: null,
    ...change,
  };
  const data = new Map<unknown, readonly unknown[]>([
    [notificationOutbox, missing === 'outbox' ? [] : [row]],
    [bookings, missing === 'booking' ? [] : [{ customerUserId: customerId, branchId }]],
    [bookingHistory, missing === 'history' ? [] : [{ id: randomUUID() }]],
    [branches, missing === 'owner' ? [] : [{ userId: ownerId }]],
    [managerAssignments, []],
    ...extra,
  ]);
  const predicates: { table: unknown; value: SQL }[] = [],
    locks: unknown[] = [],
    writes: { table: unknown; value: unknown }[] = [];
  const conflict = vi.fn(async () => {
    if (advanceOnInsert) clock = advanceOnInsert;
  });
  function select() {
    let table: unknown;
    const query = {
      from(value: unknown) {
        table = value;
        return query;
      },
      where(value: SQL) {
        predicates.push({ table, value });
        return query;
      },
      innerJoin() {
        return query;
      },
      limit() {
        return query;
      },
      for() {
        locks.push(table);
        if (advanceOnLock) clock = advanceOnLock;
        return query;
      },
      then(resolve: (value: readonly unknown[]) => unknown, reject: (error: unknown) => unknown) {
        return Promise.resolve(data.get(table) ?? []).then(resolve, reject);
      },
    };
    return query;
  }
  const set = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
  const transaction = {
    select,
    insert: (table: unknown) => ({
      values: (value: unknown) => {
        writes.push({ table, value });
        return { onConflictDoNothing: conflict };
      },
    }),
    update: () => ({ set }),
  } as unknown as NotificationTransaction;
  // Unit-only query double; PostgreSQL rollback/lease races remain real-container tests.
  const database = {
    transaction: (work: (tx: NotificationTransaction) => Promise<boolean>) => work(transaction),
  } as unknown as Database;
  return {
    repository: new NotificationRepository(database, () => clock),
    predicates,
    locks,
    writes,
    set,
    conflict,
    advanceOnLock: (value: Date) => {
      advanceOnLock = value;
    },
    advanceOnInsert: (value: Date) => {
      advanceOnInsert = value;
    },
  };
}
it.each(stateEvents)(
  'NTF-002: %s proves persisted history and queues only scoped recipients before acknowledgement',
  async (event) => {
    const input = { ...lease, payload: { ...lease.payload, event } },
      value = fixture({ payload: input.payload });
    expect(await value.repository.publishBooking(input, now)).toBe(true);
    expect(value.locks).toEqual([notificationOutbox]);
    expect(value.writes).toHaveLength(event === 'booking.submitted' ? 2 : 1);
    expect(value.writes[0]?.value).toMatchObject({
      eventType: 'notification.create',
      recipientUserId: customerId,
      payload: { event, operationId: lease.payload.bookingId },
    });
    if (event === 'booking.submitted')
      expect(value.writes[1]?.value).toMatchObject({
        recipientUserId: ownerId,
        payload: { event: 'booking.received', operationId: lease.payload.bookingId },
      });
    expect(value.set).toHaveBeenCalledWith({
      status: 'sent',
      sentAt: now,
      lastError: null,
      leaseToken: null,
      leaseExpiresAt: null,
    });
    const predicate = value.predicates.find((entry) => entry.table === bookingHistory);
    if (!predicate) throw new Error('History proof missing');
    const query = new PgDialect().sqlToQuery(predicate.value);
    expect(query.params).toContain(lease.payload.bookingId);
    if (event === 'booking.submitted') {
      expect(query.sql).toContain('is null');
      expect(query.params).toContain('pending_request');
    } else expect(query.params).toContain(event.slice('booking.'.length));
  },
);
it.each([
  { status: 'sent' as const },
  { status: 'dead' as const },
  { leaseToken: randomUUID() },
  { leaseExpiresAt: null },
  { leaseExpiresAt: now },
  { channel: 'email' as const },
  { eventType: 'unsupported' },
  { recipientUserId: customerId },
  { payload: {} },
  { payload: { ...lease.payload, event: 'booking.cancelled' } },
  { payload: { ...lease.payload, bookingId: randomUUID() } },
])(
  'NTF-002: stale, changed or invalid persisted lifecycle leases never fan out or acknowledge',
  async (change) => {
    const value = fixture(change);
    expect(await value.repository.publishBooking(lease, now)).toBe(false);
    expect(value.writes).toHaveLength(0);
    expect(value.set).not.toHaveBeenCalled();
  },
);
it('NTF-002: absent outbox rows cannot publish', async () => {
  const value = fixture({}, 'outbox');
  expect(await value.repository.publishBooking(lease, now)).toBe(false);
  expect(value.writes).toHaveLength(0);
});
it.each(['booking', 'history', 'owner'] as const)(
  'NTF-002 SEC-003: missing %s source fails closed before publication',
  async (missing) => {
    const value = fixture({}, missing);
    await expect(value.repository.publishBooking(lease, now)).rejects.toBeInstanceOf(
      InvalidNotificationJob,
    );
    expect(value.writes).toHaveLength(0);
    expect(value.set).not.toHaveBeenCalled();
  },
);
it('NTF-002: a lease expiring while waiting for its outbox lock cannot publish', async () => {
  const value = fixture();
  value.advanceOnLock(lease.leaseExpiresAt);
  expect(await value.repository.publishBooking(lease, now)).toBe(false);
  expect(value.writes).toHaveLength(0);
});
it('NTF-002: recipient enqueue failures propagate without acknowledging the source event', async () => {
  const value = fixture();
  value.conflict.mockRejectedValueOnce(new Error('Outbox unavailable'));
  await expect(value.repository.publishBooking(lease, now)).rejects.toThrow('Outbox unavailable');
  expect(value.set).not.toHaveBeenCalled();
});
it('NTF-002: expiry during recipient writes throws so the transaction rolls back instead of acknowledging', async () => {
  const value = fixture();
  value.advanceOnInsert(lease.leaseExpiresAt);
  await expect(value.repository.publishBooking(lease, now)).rejects.toThrow('lease expired');
  expect(value.set).not.toHaveBeenCalled();
});

it('NTF-002 / ACC-002: booking receipt reaches the Owner and only fully granted active Managers', async () => {
  const partial = randomUUID();
  const value = fixture({}, undefined, [
    [
      managerAssignments,
      [
        { userId: managerId, permission: 'booking_manage' },
        { userId: partial, permission: 'payment_record' },
      ],
    ],
  ]);
  expect(await value.repository.publishBooking(lease, now)).toBe(true);
  expect(
    value.writes.map((write) => (write.value as { recipientUserId: string }).recipientUserId),
  ).toEqual([customerId, ...[ownerId, managerId].sort()]);
});
it.each([
  ['booking.approved', [[bookingUpfrontTerms, [{ approvedAt: now }]]], undefined],
  ['booking.payment_rejected', [[bookingPaymentProofs, [{ state: 'rejected' }]]], proofId],
] as const)(
  'SRS v2.11: %s is proven by its upfront record and reaches only the customer',
  async (event, extra, proof) => {
    const payload = {
        event,
        bookingId: lease.payload.bookingId,
        ...(proof ? { proofId: proof } : {}),
      },
      value = fixture({ payload }, undefined, [...extra]);
    expect(await value.repository.publishBooking({ ...lease, payload }, now)).toBe(true);
    expect(value.writes).toHaveLength(1);
    expect(value.writes[0]?.value).toMatchObject({
      recipientUserId: customerId,
      payload: { event, operationId: proof ?? lease.payload.bookingId },
    });
  },
);
it('SRS v2.11 / CHG-010: a submitted proof notifies the customer and fully granted reviewers', async () => {
  const payload = {
    event: 'booking.payment_submitted' as const,
    bookingId: lease.payload.bookingId,
    proofId,
  };
  const value = fixture({ payload }, undefined, [
    [bookingPaymentProofs, [{ state: 'submitted' }]],
    [
      managerAssignments,
      [
        { userId: managerId, permission: 'booking_manage' },
        { userId: managerId, permission: 'payment_record' },
        { userId: managerId, permission: 'finance_view' },
      ],
    ],
  ]);
  expect(await value.repository.publishBooking({ ...lease, payload }, now)).toBe(true);
  expect(value.writes.map((write) => (write.value as { payload: unknown }).payload)).toEqual([
    { event: 'booking.payment_submitted', operationId: proofId },
    { event: 'booking.payment_review', operationId: proofId },
    { event: 'booking.payment_review', operationId: proofId },
  ]);
});
it('SRS v2.11: an unproven upfront event is invalid and never fans out', async () => {
  const payload = {
      event: 'booking.payment_rejected' as const,
      bookingId: lease.payload.bookingId,
      proofId,
    },
    value = fixture({ payload }, undefined, [[bookingPaymentProofs, [{ state: 'submitted' }]]]);
  await expect(value.repository.publishBooking({ ...lease, payload }, now)).rejects.toBeInstanceOf(
    InvalidNotificationJob,
  );
  expect(value.writes).toHaveLength(0);
});
