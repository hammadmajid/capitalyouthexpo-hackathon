import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { branches, visitHistory, visitRequests } from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { readVisitHistory } from './history.js';
const branchId = randomUUID(),
  visitId = randomUUID(),
  userId = randomUUID();
const now = new Date('2026-10-22T03:00:00Z');
const visit: typeof visitRequests.$inferSelect = {
  id: visitId,
  branchId,
  customerUserId: userId,
  status: 'requested',
  requestedStart: now,
  proposedStart: null,
  reason: null,
  decidedByUserId: null,
  followUpSentAt: null,
  createdAt: now,
  updatedAt: now,
};
const entry = {
  id: '10000000-0000-4000-8000-000000000001',
  branchId,
  visitId,
  actorUserId: userId,
  action: 'reschedule',
  status: 'rescheduled',
  requestedStart: now,
  proposedStart: new Date('2026-11-05T05:00:00Z'),
  reason: 'Please choose a later time',
  createdAt: now,
};
it('VISIT-001 / SEC-003: history retains proposal snapshots without disclosing actor/account identifiers', async () => {
  const f = queryFixture();
  f.enqueue(branches, [{ branchName: 'Real hostel', customerName: 'Customer name' }]);
  f.enqueue(visitHistory, [entry, { ...entry, id: '10000000-0000-4000-8000-000000000002' }]);
  const result = await readVisitHistory(f.transaction, visit, { limit: 1 });
  expect(result.data).toHaveLength(1);
  expect(result.nextCursor).toBe(entry.id);
  expect(result.data[0]?.proposedStart).toBe('2026-11-05T05:00:00.000Z');
  expect(result.branchName).toBe('Real hostel');
  expect(JSON.stringify(result)).not.toContain(userId);
  expect(result.data[0]).not.toHaveProperty('actorUserId');
  const predicate = f.predicates.find((value) => value.table === visitHistory);
  if (!predicate) throw Error('History scope absent');
  expect(new PgDialect().sqlToQuery(predicate.value).params).toEqual([branchId, visitId]);
});
it('VISIT-001: bounded exclusive history cursor returns a genuine terminal page', async () => {
  const f = queryFixture();
  f.enqueue(branches, [{ branchName: 'Real hostel', customerName: 'Customer name' }]);
  f.enqueue(visitHistory, []);
  const result = await readVisitHistory(f.transaction, visit, { limit: 20, cursor: entry.id });
  expect(result.data).toEqual([]);
  expect(result.nextCursor).toBeNull();
  const predicate = f.predicates.find((value) => value.table === visitHistory);
  if (!predicate) throw Error('History scope absent');
  expect(new PgDialect().sqlToQuery(predicate.value).params).toEqual([branchId, visitId, entry.id]);
});
it('VISIT-001: missing source and malformed persisted snapshots fail closed', async () => {
  const f = queryFixture();
  await expect(readVisitHistory(f.transaction, visit, { limit: 20 })).rejects.toMatchObject({
    status: 404,
  });
  f.enqueue(branches, [{ branchName: 'Real hostel', customerName: 'Customer name' }]);
  f.enqueue(visitHistory, [{ ...entry, action: 'invented' }]);
  await expect(readVisitHistory(f.transaction, visit, { limit: 20 })).rejects.toThrow();
});
