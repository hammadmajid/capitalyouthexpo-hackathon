import { expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { branches } from '@hsm/db';
import type { Actor } from '../authorization/store.js';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { reportOwnedBranchIds } from './report-owner-scope.js';
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actor = { userId: id(999) } as Actor;
it.each([0, 1, 99, 100, 101, 200, 201])(
  'SEC-003 / RPT-001 / AUD-010: bounded traversal retains all %i authorized branches',
  async (count) => {
    const f = queryFixture();
    const rows = Array.from({ length: count }, (_, index) => ({
      id: id(index),
      name: 'Name ' + String(index).padStart(3, '0'),
    }));
    for (let offset = 0; offset < count; offset += 100)
      f.enqueue(branches, rows.slice(offset, offset + 100));
    expect(await reportOwnedBranchIds(f.transaction, actor)).toEqual(rows.map((row) => row.id));
    expect(
      f.operations
        .filter((entry) => entry.kind === 'limit')
        .every((entry) => entry.args[0] === 100),
    ).toBe(true);
    const queries = f.predicates.map((entry) => new PgDialect().sqlToQuery(entry.value));
    expect(
      queries.every(
        (query) =>
          query.params.includes(actor.userId) &&
          query.sql.includes('"organizations"."archived_at" is null') &&
          query.sql.includes('"branches"."archived_at" is null'),
      ),
    ).toBe(true);
    if (count >= 100) {
      expect(queries[1]?.params).toContain('Name 099');
      expect(queries[1]?.params).toContain(id(99));
    }
  },
);
it('SEC-003 / AUD-010: explicit branch subsets are predicates and an empty selection never becomes all-owned', async () => {
  const f = queryFixture();
  expect(await reportOwnedBranchIds(f.transaction, actor, [])).toEqual([]);
  expect(f.predicates).toEqual([]);
  f.enqueue(branches, [{ id: id(1), name: 'Target' }]);
  expect(await reportOwnedBranchIds(f.transaction, actor, [id(1)])).toEqual([id(1)]);
  const predicate = f.predicates[0];
  if (!predicate) throw new Error('Expected owner scope predicate');
  expect(new PgDialect().sqlToQuery(predicate.value).params).toContain(id(1));
});
it('RPT-001 / AUD-010: repeated database rows fail rather than silently duplicate or loop', async () => {
  const f = queryFixture();
  f.enqueue(branches, [
    { id: id(1), name: 'Same' },
    { id: id(1), name: 'Same' },
  ]);
  await expect(reportOwnedBranchIds(f.transaction, actor)).rejects.toMatchObject({
    code: 'INTERNAL',
  });
});
