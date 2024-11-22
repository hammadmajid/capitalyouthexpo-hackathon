import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { visitRequests, visitingHours } from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { projectVisit, readVisitHours, readVisitPage } from './state.js';
const branchId = randomUUID(),
  userId = randomUUID(),
  first = '10000000-0000-4000-8000-000000000001',
  second = '10000000-0000-4000-8000-000000000002';
function row(id = first): typeof visitRequests.$inferSelect {
  return {
    id,
    branchId,
    customerUserId: userId,
    requestedStart: new Date('2026-11-05T05:00:00Z'),
    proposedStart: null,
    status: 'requested',
    decidedByUserId: null,
    reason: null,
    followUpSentAt: null,
    createdAt: new Date('2026-10-22T03:00:00Z'),
    updatedAt: new Date('2026-10-22T03:00:00Z'),
  };
}
it('VISIT-001 / SEC-003: private projection omits account, decision actor and follow-up metadata', () => {
  const result = projectVisit(row());
  expect(result.proposedStart).toBeNull();
  expect(result.reason).toBeNull();
  expect(result.createdAt).toBe('2026-10-22T03:00:00.000Z');
  expect(JSON.stringify(result)).not.toContain(userId);
  expect(result).not.toHaveProperty('customerUserId');
  expect(result).not.toHaveProperty('decidedByUserId');
  expect(projectVisit(row()).requestedStart).toBe('2026-11-05T05:00:00.000Z');
});
it('VISIT-001: persisted hours produce stable versions and reject unsupported second precision', async () => {
  const q = queryFixture(),
    window = { dayOfWeek: 4, opensAt: '09:00:00', closesAt: '17:00:00' };
  q.enqueue(visitingHours, [window], [window], [{ ...window, opensAt: '09:00:30' }]);
  const firstRead = await readVisitHours(q.transaction, branchId);
  expect(firstRead.windows).toEqual([{ dayOfWeek: 4, opensAt: '09:00', closesAt: '17:00' }]);
  expect(await readVisitHours(q.transaction, branchId)).toEqual(firstRead);
  await expect(readVisitHours(q.transaction, branchId)).rejects.toMatchObject({
    code: 'PRECONDITION_FAILED',
  });
});
it('VISIT-001: bounded own pagination keeps an exclusive real cursor and no hidden user identity', async () => {
  const q = queryFixture();
  q.enqueue(visitRequests, [
    { ...row(first), branchName: 'Green View Hostel', customerName: 'Test Customer' },
    { ...row(second), branchName: 'Other Hostel', customerName: 'Test Customer' },
  ]);
  const page = await readVisitPage(q.transaction, { customerUserId: userId }, { limit: 1 });
  expect(page.data).toHaveLength(1);
  expect(page.data[0]).toMatchObject({
    branchName: 'Green View Hostel',
    customerName: 'Test Customer',
  });
  expect(q.operations.filter((op) => op.kind === 'innerJoin')).toHaveLength(2);
  expect(page.nextCursor).toBe(first);
  expect(JSON.stringify(page)).not.toContain(userId);
  const predicate = q.predicates.at(0);
  if (!predicate) throw Error('Scoped query absent');
  expect(new PgDialect().sqlToQuery(predicate.value).params).toContain(userId);
  expect(q.operations).toContainEqual({ table: visitRequests, kind: 'limit', args: [2] });
});
it('VISIT-001: branch, status and local-date filters bind exact SQL values without changing private DTOs', async () => {
  const q = queryFixture();
  q.enqueue(visitRequests, []);
  expect(
    await readVisitPage(
      q.transaction,
      { branchId },
      { limit: 20, cursor: first, status: 'approved', date: '2026-11-05' },
    ),
  ).toEqual({ data: [], nextCursor: null });
  const predicate = q.predicates.at(0);
  if (!predicate) throw Error('Scoped query absent');
  const params = new PgDialect()
    .sqlToQuery(predicate.value)
    .params.map((value) => (value instanceof Date ? value.toISOString() : value));
  expect(params).toEqual([
    branchId,
    first,
    'approved',
    '2026-11-04T19:00:00.000Z',
    '2026-11-05T19:00:00.000Z',
  ]);
});
it('VISIT-001: malformed persisted state cannot become a successful private response', async () => {
  const q = queryFixture();
  q.enqueue(visitRequests, [{ ...row(), status: 'paid' }]);
  await expect(
    readVisitPage(q.transaction, { customerUserId: userId }, { limit: 20 }),
  ).rejects.toThrow();
});
