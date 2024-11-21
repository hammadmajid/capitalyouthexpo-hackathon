import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { stays, stayHistory, stayAssignments, stayAgreements, branches } from '@hsm/db';
import { InvalidNotificationJob } from './contracts.js';
import {
  residentFixture as fixture,
  residentLease as lease,
  residentNow as now,
  residentIds as ids,
} from '../test/unit/resident.fixture.js';
it('SEC-003: source queries bind exact Stay/history/assignment/agreement/Owner scope and immutable references', async () => {
  const f = fixture();
  expect(await f.repository.publishResident(lease, now)).toBe(true);
  const params = f.predicates.slice(1).map((value) => ({
    table: value.table,
    params: new PgDialect().sqlToQuery(value.value).params,
  }));
  expect(params).toEqual([
    { table: stays, params: [ids.stay] },
    { table: stayHistory, params: [ids.history, ids.stay, ids.branch] },
    { table: stayAssignments, params: [ids.assignment, ids.stay, ids.branch] },
    { table: stayAgreements, params: [ids.agreement, ids.stay, ids.branch] },
    { table: branches, params: [ids.branch] },
  ]);
});
it.each([stays, stayHistory, stayAssignments, stayAgreements, branches])(
  'SEC-003: missing required persisted admission source %# cannot publish',
  async (table) => {
    const f = fixture();
    f.data.set(table, []);
    await expect(f.repository.publishResident(lease, now)).rejects.toBeInstanceOf(
      InvalidNotificationJob,
    );
    expect(f.writes).toEqual([]);
    expect(f.updates).toEqual([]);
  },
);
it.each([
  { id: randomUUID() },
  { checkedInAt: null },
  { residentId: 'bad' },
  { userId: 'bad' },
  { source: 'synthetic' },
])(
  'SEC-003: corrupted authoritative Stay %# cannot select notification recipients',
  async (change) => {
    const f = fixture();
    f.data.set(stays, [{ ...f.stay, ...change }]);
    await expect(f.repository.publishResident(lease, now)).rejects.toBeInstanceOf(
      InvalidNotificationJob,
    );
    expect(f.writes).toEqual([]);
  },
);
it.each([
  { id: randomUUID() },
  { stayId: randomUUID() },
  { branchId: randomUUID() },
  { previousState: 'active' },
  { nextState: 'notice_given' },
  { reasonCode: 'arbitrary' },
  { createdAt: new Date(now.getTime() - 1) },
  { createdAt: new Date(now.getTime() + 1) },
])(
  'SEC-003: foreign, non-admission or impossible-time history %# cannot validate a notice',
  async (change) => {
    const f = fixture();
    f.data.set(stayHistory, [{ ...f.history, ...change }]);
    await expect(f.repository.publishResident(lease, now)).rejects.toBeInstanceOf(
      InvalidNotificationJob,
    );
    expect(f.writes).toEqual([]);
  },
);
it.each([
  { residentId: randomUUID() },
  { source: 'booking' },
  { userId: 'bad' },
  { assignmentId: 'bad' },
  { agreementId: 'bad' },
])('SEC-003: corrupt immutable history detail %# cannot create a recipient', async (change) => {
  const f = fixture();
  f.data.set(stayHistory, [{ ...f.history, detail: { ...f.history.detail, ...change } }]);
  await expect(f.repository.publishResident(lease, now)).rejects.toBeInstanceOf(
    InvalidNotificationJob,
  );
  expect(f.writes).toEqual([]);
});
it('SEC-003: valid source enum still requires the matching admission history reason', async () => {
  const f = fixture();
  f.data.set(stays, [{ ...f.stay, source: 'booking' }]);
  f.data.set(stayHistory, [{ ...f.history, detail: { ...f.history.detail, source: 'booking' } }]);
  await expect(f.repository.publishResident(lease, now)).rejects.toBeInstanceOf(
    InvalidNotificationJob,
  );
});
it.each([
  { id: randomUUID() },
  { stayId: randomUUID() },
  { branchId: randomUUID() },
  { startedAt: new Date(now.getTime() + 1) },
])(
  'SEC-003: unrelated or later assignment %# cannot impersonate the first admission',
  async (change) => {
    const f = fixture();
    f.data.set(stayAssignments, [{ ...f.assignment, ...change }]);
    await expect(f.repository.publishResident(lease, now)).rejects.toBeInstanceOf(
      InvalidNotificationJob,
    );
    expect(f.writes).toEqual([]);
  },
);
it.each([
  { id: randomUUID() },
  { stayId: randomUUID() },
  { branchId: randomUUID() },
  { version: 2 },
])(
  'SEC-003: unrelated or amended agreement %# cannot impersonate the initial admission snapshot',
  async (change) => {
    const f = fixture();
    f.data.set(stayAgreements, [{ ...f.agreement, ...change }]);
    await expect(f.repository.publishResident(lease, now)).rejects.toBeInstanceOf(
      InvalidNotificationJob,
    );
    expect(f.writes).toEqual([]);
  },
);
it('SEC-003: corrupt current Owner identity cannot become a recipient', async () => {
  const f = fixture();
  f.data.set(branches, [{ userId: 'bad' }]);
  await expect(f.repository.publishResident(lease, now)).rejects.toBeInstanceOf(
    InvalidNotificationJob,
  );
  expect(f.writes).toEqual([]);
});
it('NTF-002: preserved booking admission history supports the same safe source-bound fanout', async () => {
  const f = fixture();
  f.data.set(stays, [{ ...f.stay, source: 'booking' }]);
  f.data.set(stayHistory, [
    {
      ...f.history,
      reasonCode: 'booking_check_in',
      detail: { ...f.history.detail, source: 'booking' },
    },
  ]);
  expect(await f.repository.publishResident(lease, now)).toBe(true);
  expect(f.writes).toHaveLength(2);
});
it('NTF-002: later checkout does not erase valid immutable admission history or substitute private content', async () => {
  const f = fixture();
  f.data.set(stays, [{ ...f.stay, state: 'completed', closedAt: now }]);
  f.data.set(stayAssignments, [{ ...f.assignment, endedAt: now }]);
  expect(await f.repository.publishResident(lease, now)).toBe(true);
  expect(f.writes).toHaveLength(2);
});
