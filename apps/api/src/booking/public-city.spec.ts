import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { branches, cities } from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { publicBranch } from './projection.js';
it('ACC-002: direct public branch lookup requires an active city just like search', async () => {
  const store = queryFixture(),
    id = randomUUID();
  store.enqueue(branches, [{ id }]);
  await expect(publicBranch(store.transaction, id)).resolves.toEqual({ id });
  expect(
    store.operations.some(
      (operation) => operation.kind === 'innerJoin' && operation.args[0] === cities,
    ),
  ).toBe(true);
  const predicate = store.predicates[0];
  if (!predicate) throw new Error('Missing publication predicate');
  const query = new PgDialect().sqlToQuery(predicate.value);
  expect(query.sql).toContain('"cities"."is_active"');
  expect(query.params).toContain(true);
});

it('ACC-002 / BKG-001: mutation recheck holds the active city shared lock after branch locks', async () => {
  const store = queryFixture(),
    id = randomUUID();
  store.enqueue(branches, [{ id }]);
  await expect(publicBranch(store.transaction, id, true)).resolves.toEqual({ id });
  expect(store.locks).toEqual([{ table: branches, mode: 'share' }]);
  expect(store.operations.find((operation) => operation.kind === 'lock')?.args).toEqual([
    'share',
    { of: cities },
  ]);
});
