import { expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { bookings } from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { bookingPage } from './projection.js';
const branchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
it('AUD-009 / ACC-002: pending scope and branch are database predicates before the page limit', async () => {
  const value = queryFixture();
  value.enqueue(bookings, []);
  expect(
    await bookingPage(
      value.transaction,
      { branchId },
      { queue: 'pending_requests', limit: 1 },
      new Date(),
    ),
  ).toEqual({ data: [], nextCursor: null });
  const predicate = value.predicates.find((entry) => entry.table === bookings);
  if (!predicate) throw new Error('Missing booking predicate');
  const query = new PgDialect().sqlToQuery(predicate.value);
  expect(query.params).toEqual([branchId, 'pending_request']);
  expect(value.operations).toContainEqual({ table: bookings, kind: 'limit', args: [2] });
});
