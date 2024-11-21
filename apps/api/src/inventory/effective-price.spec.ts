import { expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { roomTypePrices, roomTypeFees } from '@hsm/db';
import { effectivePrice } from './effective-price.js';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { pageType } from '../../test/unit/inventory-pages.fixture.js';
it('BKG-004: a due version supplies all prices and fees together without rereading legacy fees', async () => {
  const store = queryFixture(),
    type = pageType(),
    version = { ...type, id: type.id, roomTypeId: type.id, fees: [] };
  store.enqueue(roomTypePrices, [version]);
  expect(await effectivePrice(store.transaction, type, new Date('2026-10-25T19:00:00Z'))).toEqual(
    version,
  );
  expect(store.predicates.some((entry) => entry.table === roomTypeFees)).toBe(false);
  const condition = store.predicates[0];
  expect(condition && new PgDialect().sqlToQuery(condition.value).params).toEqual([
    type.branchId,
    type.id,
    '2026-10-26',
  ]);
});
it('BKG-004: before the first due date, fallback preserves exact legacy prices and validates disclosed fees', async () => {
  const store = queryFixture(),
    type = pageType();
  store.enqueue(roomTypeFees, [{ code: 'mess', cadence: 'monthly', amountPaisa: 1001n }]);
  expect(await effectivePrice(store.transaction, type, new Date('2026-10-25T18:59:59Z'))).toEqual({
    ...type,
    fees: [{ code: 'mess', cadence: 'monthly', amountPaisa: 1001 }],
  });
  const condition = store.predicates[0];
  expect(condition && new PgDialect().sqlToQuery(condition.value).params).toEqual([
    type.branchId,
    type.id,
    '2026-10-25',
  ]);
});
it('BKG-004: legacy fee corruption cannot become a valid quote', async () => {
  const store = queryFixture();
  store.enqueue(roomTypeFees, [{ code: 'unapproved', cadence: 'monthly', amountPaisa: 1001n }]);
  await expect(effectivePrice(store.transaction, pageType(), new Date())).rejects.toThrow();
});
