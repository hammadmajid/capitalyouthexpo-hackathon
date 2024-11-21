import { expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { branches } from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { dashboardOwnedBranches } from './dashboard-owner.repository.js';
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actor = { userId: id(900), sessionId: id(901) };
it.each([0, 1, 100, 101, 200, 201])(
  'AUD-009 / OWN-003: complete Owner traversal retains %i rows with bounded queries',
  async (count) => {
    const f = queryFixture();
    const rows = Array.from({ length: count }, (_, index) => ({
      id: id(index),
      name: 'Branch ' + String(index).padStart(3, '0'),
      verificationStatus: 'approved',
    }));
    for (let offset = 0; offset < count; offset += 100)
      f.enqueue(branches, rows.slice(offset, offset + 100));
    expect(await dashboardOwnedBranches(f.transaction, actor)).toEqual(rows);
    expect(
      f.operations.filter((row) => row.kind === 'limit').every((row) => row.args[0] === 100),
    ).toBe(true);
    for (const query of f.predicates)
      expect(new PgDialect().sqlToQuery(query.value).params).toContain(actor.userId);
  },
);
it('AUD-009 / ACC-002: missing selected branch and duplicate traversal fail closed', async () => {
  const missing = queryFixture();
  await expect(dashboardOwnedBranches(missing.transaction, actor, id(1))).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  const duplicated = queryFixture();
  const rows = Array.from({ length: 100 }, (_, index) => ({
    id: id(index),
    name: 'B' + index,
    verificationStatus: 'approved',
  }));
  duplicated.enqueue(branches, rows, [rows[0]]);
  await expect(dashboardOwnedBranches(duplicated.transaction, actor)).rejects.toMatchObject({
    code: 'INTERNAL',
  });
});
