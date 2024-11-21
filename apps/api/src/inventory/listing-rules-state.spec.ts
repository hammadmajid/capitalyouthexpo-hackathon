import { expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { hostelRules } from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { ruleIds as ids, ruleNow, ruleRow } from '../../test/unit/listing-rules.fixture.js';
import {
  projectListingRule,
  readListingRuleRow,
  readListingRulesPage,
} from './listing-rules-state.js';
it('TRUST-006: current rule versions bind actual state and revision, including an ABA text round trip', () => {
  const row = ruleRow(),
    initial = projectListingRule(row);
  expect(initial).toMatchObject({
    id: ids.first,
    branchId: ids.branch,
    body: row.body,
    archivedAt: null,
  });
  expect(initial.version).toHaveLength(64);
  for (const change of [
    { body: 'Updated' },
    { sortOrder: 1 },
    { revision: 2 },
    { archivedAt: ruleNow },
    { updatedAt: new Date(ruleNow.getTime() + 1) },
  ])
    expect(projectListingRule(ruleRow(change)).version).not.toBe(initial.version);
  expect(projectListingRule(ruleRow({ revision: 3 })).version).not.toBe(initial.version);
  expect(initial).not.toHaveProperty('revision');
});
it.each([0, -1, 1.5, NaN, 2147483648])(
  'TRUST-006: malformed internal revision %s fails closed',
  (revision) => {
    expect(() => projectListingRule(ruleRow({ revision }))).toThrowError(
      expect.objectContaining({ code: 'INTERNAL' }),
    );
  },
);
it('TRUST-006: malformed timestamps or body cannot become a rule response', () => {
  for (const change of [
    { createdAt: new Date('invalid') },
    { updatedAt: new Date('invalid') },
    { archivedAt: new Date('invalid') },
    { body: ' ' },
    { body: 'x'.repeat(4001) },
  ])
    expect(() => projectListingRule(ruleRow(change))).toThrowError(
      expect.objectContaining({ code: 'INTERNAL' }),
    );
});
it('ACC-004: exact child reads bind branch and UUID under the row lock', async () => {
  const store = queryFixture();
  store.enqueue(hostelRules, [ruleRow()]);
  expect(await readListingRuleRow(store.transaction, ids.branch, ids.first)).toEqual(ruleRow());
  const condition = store.predicates[0];
  if (!condition) throw new Error('Missing scoped condition');
  expect(new PgDialect().sqlToQuery(condition.value).params).toEqual([ids.branch, ids.first]);
  expect(store.locks).toContainEqual({ table: hostelRules, mode: 'update' });
  expect(store.operations).toContainEqual({ table: hostelRules, kind: 'limit', args: [1] });
});
it('ACC-004: a guessed foreign child is not found and mismatched driver metadata cannot leak', async () => {
  const missing = queryFixture();
  await expect(
    readListingRuleRow(missing.transaction, ids.branch, ids.first),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  for (const change of [{ branchId: ids.third }, { id: ids.second }]) {
    const store = queryFixture();
    store.enqueue(hostelRules, [ruleRow(change)]);
    await expect(
      readListingRuleRow(store.transaction, ids.branch, ids.first),
    ).rejects.toMatchObject({ code: 'INTERNAL' });
  }
});
it('ACC-004: ordered private pages are bounded with real continuation and current edit authority', async () => {
  const store = queryFixture();
  store.enqueue(hostelRules, [ruleRow(), ruleRow({ id: ids.second })]);
  const page = await readListingRulesPage(
    store.transaction,
    ids.branch,
    { limit: 1, state: 'active' },
    false,
  );
  expect(page).toMatchObject({
    branchId: ids.branch,
    state: 'active',
    canEdit: false,
    nextCursor: '0:' + ids.first,
  });
  expect(page.data.map((row) => row.id)).toEqual([ids.first]);
  expect(store.operations).toContainEqual({ table: hostelRules, kind: 'limit', args: [2] });
  expect(store.locks).toContainEqual({ table: hostelRules, mode: 'share' });
});
it('ACC-004: archive/cursor filters remain explicit and genuine empty pages stay empty', async () => {
  const store = queryFixture();
  store.enqueue(hostelRules, [ruleRow({ id: ids.second, archivedAt: ruleNow })]);
  const input = { limit: 20, state: 'archived' as const, cursor: '0:' + ids.first };
  expect(
    (await readListingRulesPage(store.transaction, ids.branch, input, true)).data,
  ).toHaveLength(1);
  const condition = store.predicates[0];
  if (!condition) throw new Error('Missing scoped condition');
  const sql = new PgDialect().sqlToQuery(condition.value);
  expect(sql.params).toEqual([ids.branch, 0, 0, ids.first]);
  expect(sql.sql).toContain('is not null');
  const empty = queryFixture();
  expect(
    await readListingRulesPage(
      empty.transaction,
      ids.branch,
      { limit: 20, state: 'active' },
      false,
    ),
  ).toMatchObject({ data: [], nextCursor: null });
});
it('ACC-004: malformed, oversized, cross-scope, duplicate and wrong-state pages fail rather than truncate or leak', async () => {
  for (const rows of [
    [ruleRow({ branchId: ids.third })],
    [ruleRow({ archivedAt: ruleNow })],
    [
      ruleRow(),
      ruleRow({ id: ids.second }),
      ruleRow({ id: ids.third }),
      ruleRow({ id: ids.branch }),
    ],
    [ruleRow(), ruleRow({ id: ids.second }), ruleRow({ id: ids.second })],
    [ruleRow(), ruleRow()],
    [ruleRow({ id: ids.second }), ruleRow()],
    [ruleRow({ body: '' })],
  ]) {
    const store = queryFixture();
    store.enqueue(hostelRules, rows);
    await expect(
      readListingRulesPage(store.transaction, ids.branch, { limit: 2, state: 'active' }, true),
    ).rejects.toMatchObject({ code: 'INTERNAL' });
  }
  const store = queryFixture();
  store.enqueue(hostelRules, [ruleRow()]);
  await expect(
    readListingRulesPage(store.transaction, ids.branch, { limit: 20, state: 'archived' }, true),
  ).rejects.toMatchObject({ code: 'INTERNAL' });
});
