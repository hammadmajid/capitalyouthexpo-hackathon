import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { stays, stayHistory, notificationOutbox } from '@hsm/db';
import type { ResidentLifecycleLease } from './contracts.js';
import {
  residentFixture as fixture,
  residentLease as lease,
  residentNow as now,
  residentIds as ids,
} from '../test/unit/resident.fixture.js';
it('NTF-002 / ACC-004: persisted admission source fanout queues sorted exact recipients and acknowledges the same lease atomically', async () => {
  const f = fixture();
  expect(await f.repository.publishResident(lease, now)).toBe(true);
  const expected = [
    { userId: ids.owner, event: 'resident.admission_recorded' },
    { userId: ids.user, event: 'resident.stay_started' },
  ].sort((left, right) => left.userId.localeCompare(right.userId));
  expect(f.writes).toEqual(
    expected.map((target) => ({
      table: notificationOutbox,
      value: {
        eventType: 'notification.create',
        channel: 'in_app',
        recipientUserId: target.userId,
        payload: { event: target.event, operationId: ids.history },
        dedupeKey: 'in_app:' + target.userId + ':' + target.event + ':' + ids.history,
        createdAt: now,
        nextAttemptAt: now,
      },
    })),
  );
  expect(f.updates).toEqual([
    { status: 'sent', sentAt: now, lastError: null, leaseToken: null, leaseExpiresAt: null },
  ]);
  expect(f.locks).toEqual([{ table: notificationOutbox, mode: 'update' }]);
  expect(f.limits).toEqual([1, 1, 1, 1, 1]);
  const outbox = f.predicates[0];
  if (!outbox) throw Error('Outbox predicate missing');
  expect(new PgDialect().sqlToQuery(outbox.value).params).toEqual([lease.id]);
});
it.each([null, randomUUID()])(
  'RES-003 / SEC-003: changed explicit link %s suppresses the former account recipient',
  async (userId) => {
    const f = fixture();
    f.data.set(stays, [{ ...f.stay, userId }]);
    expect(await f.repository.publishResident(lease, now)).toBe(true);
    expect(f.writes).toHaveLength(1);
    expect(f.writes[0]?.value).toMatchObject({ recipientUserId: ids.owner });
  },
);
it.each([null, ids.user])(
  'RES-003: original offline relationship never gains a retroactive recipient when its current link is %s',
  async (userId) => {
    const f = fixture();
    f.data.set(stays, [{ ...f.stay, userId }]);
    f.data.set(stayHistory, [{ ...f.history, detail: { ...f.history.detail, userId: null } }]);
    expect(await f.repository.publishResident(lease, now)).toBe(true);
    expect(f.writes).toHaveLength(1);
    expect(f.writes[0]?.value).toMatchObject({ recipientUserId: ids.owner });
  },
);
it.each([
  { status: 'sent' as const },
  { status: 'dead' as const },
  { leaseToken: randomUUID() },
  { leaseToken: null },
  { leaseExpiresAt: null },
  { leaseExpiresAt: now },
  { channel: 'internal' as const },
  { eventType: 'booking.lifecycle' },
  { recipientUserId: ids.user },
])(
  'NTF-002: stale or recipient-injected persisted lease %# does not publish or acknowledge',
  async (change) => {
    const f = fixture(change);
    expect(await f.repository.publishResident(lease, now)).toBe(false);
    expect(f.writes).toEqual([]);
    expect(f.updates).toEqual([]);
  },
);
it('NTF-002: missing persisted outbox row cannot publish', async () => {
  const f = fixture();
  f.data.set(notificationOutbox, []);
  expect(await f.repository.publishResident(lease, now)).toBe(false);
  expect(f.writes).toEqual([]);
  expect(f.updates).toEqual([]);
});
it.each([
  { event: 'unknown', stayId: ids.stay, historyId: ids.history },
  { ...lease.payload, stayId: randomUUID() },
  { ...lease.payload, historyId: randomUUID() },
  { ...lease.payload, body: 'Injected private content' },
])(
  'SEC-003: malformed or mismatched authoritative lifecycle payload %# cannot select recipients',
  async (payload) => {
    const f = fixture({ payload });
    expect(await f.repository.publishResident(lease, now)).toBe(false);
    expect(f.writes).toEqual([]);
    expect(f.updates).toEqual([]);
  },
);
it('SEC-003: forged direct port event cannot alias a valid persisted admission event', async () => {
  const f = fixture(),
    forged = {
      ...lease,
      payload: { ...lease.payload, event: 'booking.confirmed' },
    } as unknown as ResidentLifecycleLease;
  expect(await f.repository.publishResident(forged, now)).toBe(false);
  expect(f.writes).toEqual([]);
});
it('NTF-002 / ACC-004: required child queue failure propagates without acknowledging the source', async () => {
  const f = fixture();
  f.failQueue();
  await expect(f.repository.publishResident(lease, now)).rejects.toThrow(
    'Required resident queue failed',
  );
  expect(f.updates).toEqual([]);
});
it('NTF-002: clock advancement during source lock cannot extend an expired lease', async () => {
  const f = fixture();
  f.advanceLock(lease.leaseExpiresAt);
  expect(await f.repository.publishResident(lease, now)).toBe(false);
  expect(f.writes).toEqual([]);
  expect(f.updates).toEqual([]);
});
it('NTF-002 / ACC-004: lease expiry during recipient insertion rejects before source acknowledgement', async () => {
  const f = fixture();
  f.advanceInsert(lease.leaseExpiresAt);
  await expect(f.repository.publishResident(lease, now)).rejects.toThrow('lease expired');
  expect(f.updates).toEqual([]);
});
it('NTF-002: earlier local clock cannot move the requested delivery instant backwards', async () => {
  const f = fixture(),
    requestedAt = new Date(now.getTime() + 1000);
  expect(await f.repository.publishResident(lease, requestedAt)).toBe(true);
  expect(f.updates[0]?.sentAt).toEqual(requestedAt);
});
it('SEC-003: invalid current delivery clock cannot publish or acknowledge', async () => {
  const f = fixture();
  f.setClock(new Date(Number.NaN));
  await expect(f.repository.publishResident(lease, now)).rejects.toThrow();
  expect(f.writes).toEqual([]);
  expect(f.updates).toEqual([]);
});
