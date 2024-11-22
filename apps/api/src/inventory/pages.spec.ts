import { expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { roomTypes, currentRoomTypes, roomTypeFees, rooms, seats } from '@hsm/db';
import { readInventoryTypePage, readInventoryRoomPage, readInventorySeatPage } from './pages.js';
import { queryFixture } from '../../test/unit/query-fixture.js';
import {
  pageIds as ids,
  pageNow,
  pageAccess as access,
  pageType,
  pageRoom,
  pageSeat,
} from '../../test/unit/inventory-pages.fixture.js';
function fixture() {
  return queryFixture();
}
function predicateOf(store: ReturnType<typeof queryFixture>, table: unknown) {
  const row = store.predicates.find((item) => item.table === table);
  if (!row) throw new Error('Missing scoped predicate');
  return new PgDialect().sqlToQuery(row.value);
}
it('ROOM-002 / ACC-004: type page reads at most limit-plus-one with one scoped fee batch and exact paisa', async () => {
  const store = fixture();
  store.enqueue(currentRoomTypes, [
    pageType(),
    pageType({ id: ids.second }),
    pageType({ id: ids.third }),
  ]);
  store.enqueue(roomTypeFees, [
    {
      branchId: ids.branch,
      roomTypeId: ids.first,
      code: 'mess',
      cadence: 'monthly',
      amountPaisa: 1001n,
    },
  ]);
  const result = await readInventoryTypePage(store.transaction, access, { limit: 2 });
  expect(result.data.map((row) => row.id)).toEqual([ids.first, ids.second]);
  expect(result.nextCursor).toBe(ids.second);
  expect(result.data[0]?.bedMonthlyRentPaisa).toBe(1800001);
  expect(result.data[0]?.fees).toEqual([{ code: 'mess', cadence: 'monthly', amountPaisa: 1001 }]);
  expect(store.operations.filter((row) => row.kind === 'limit').map((row) => row.args)).toEqual([
    [3],
    [97],
  ]);
  const dialect = new PgDialect(),
    predicates = store.predicates.map((row) => dialect.sqlToQuery(row.value));
  expect(predicates[0]?.params).toContain(ids.branch);
  expect(predicates[0]?.sql).toContain('"archived_at" is null');
  expect(predicates[1]?.params).toEqual([ids.branch, ids.first, ids.second, ids.third]);
  expect(store.locks.map((row) => row.mode)).toEqual(['share']);
});
it('ROOM-002: genuine empty type page does not read fees', async () => {
  const store = fixture();
  expect(await readInventoryTypePage(store.transaction, access, { limit: 20 })).toEqual({
    ...access,
    data: [],
    nextCursor: null,
  });
  expect(store.predicates.some((row) => row.table === roomTypeFees)).toBe(false);
});
it.each([
  [pageType({ branchId: ids.third })],
  [pageType({ archivedAt: pageNow })],
  [pageType(), pageType()],
  [pageType({ id: ids.second }), pageType()],
  [pageType(), pageType({ id: ids.second, capacity: -1 })],
])(
  'ACC-004: invalid type rows or probe fail safely instead of truncating corruption',
  async (...rows) => {
    const store = fixture();
    store.enqueue(currentRoomTypes, rows.flat());
    await expect(
      readInventoryTypePage(store.transaction, access, { limit: 1 }),
    ).rejects.toMatchObject({ code: 'INTERNAL', status: 500 });
  },
);
it('ROOM-002: a page cannot repeat its cursor or exceed the bounded driver response', async () => {
  const store = fixture();
  store.enqueue(currentRoomTypes, [pageType()]);
  await expect(
    readInventoryTypePage(store.transaction, access, { limit: 1, cursor: ids.first }),
  ).rejects.toMatchObject({ code: 'INTERNAL' });
  store.enqueue(currentRoomTypes, [
    pageType(),
    pageType({ id: ids.second }),
    pageType({ id: ids.third }),
  ]);
  await expect(
    readInventoryTypePage(store.transaction, access, { limit: 1 }),
  ).rejects.toMatchObject({ code: 'INTERNAL' });
});
it('ACC-004: fee rows must identify an actual current page type and branch', async () => {
  const store = fixture();
  store.enqueue(currentRoomTypes, [pageType()]);
  store.enqueue(roomTypeFees, [
    {
      branchId: ids.third,
      roomTypeId: ids.first,
      code: 'mess',
      cadence: 'monthly',
      amountPaisa: 1001n,
    },
  ]);
  await expect(
    readInventoryTypePage(store.transaction, access, { limit: 1 }),
  ).rejects.toMatchObject({ code: 'INTERNAL' });
});
it('ROOM-002: rooms are bounded to their selected live parent and retain unavailable statuses for management', async () => {
  const store = fixture();
  store.enqueue(roomTypes, [{ id: ids.third }]);
  store.enqueue(rooms, [pageRoom(), pageRoom({ id: ids.second })]);
  const result = await readInventoryRoomPage(store.transaction, access, ids.third, { limit: 1 });
  expect(result.data).toEqual([
    {
      id: ids.first,
      branchId: ids.branch,
      roomTypeId: ids.third,
      label: '203',
      status: 'maintenance',
      archivedAt: null,
    },
  ]);
  expect(result.nextCursor).toBe(ids.first);
  const predicate = predicateOf(store, rooms);
  expect(predicate.params).toEqual([ids.branch, ids.third]);
  expect(store.operations.filter((row) => row.kind === 'limit').map((row) => row.args)).toEqual([
    [1],
    [2],
  ]);
});
it('ACC-004: missing/archived/foreign room-type parent returns 404 before a child collection read', async () => {
  const store = fixture();
  await expect(
    readInventoryRoomPage(store.transaction, access, ids.third, { limit: 20 }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  expect(store.predicates.some((row) => row.table === rooms)).toBe(false);
});
it('ACC-004: beds are bounded and check the active room and its active room-type ancestor in SQL', async () => {
  const store = fixture();
  store.enqueue(rooms, [{ id: ids.third }]);
  store.enqueue(seats, [pageSeat(), pageSeat({ id: ids.second })]);
  const result = await readInventorySeatPage(store.transaction, access, ids.third, { limit: 1 });
  expect(result.data[0]).toMatchObject({ label: 'A', ordinal: 3, status: 'inactive' });
  expect(result.nextCursor).toBe(ids.first);
  expect(store.operations.some((row) => row.table === rooms && row.kind === 'innerJoin')).toBe(
    true,
  );
  const predicate = predicateOf(store, seats);
  expect(predicate.params).toEqual([ids.branch, ids.third]);
});
it('ACC-004: missing room never reads or leaks beds', async () => {
  const store = fixture();
  await expect(
    readInventorySeatPage(store.transaction, access, ids.third, { limit: 20 }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  expect(store.predicates.some((row) => row.table === seats)).toBe(false);
});
it('ACC-004: invalid room/seat probe scope is checked before slicing', async () => {
  const store = fixture();
  store.enqueue(roomTypes, [{ id: ids.third }]);
  store.enqueue(rooms, [pageRoom(), pageRoom({ id: ids.second, roomTypeId: ids.first })]);
  await expect(
    readInventoryRoomPage(store.transaction, access, ids.third, { limit: 1 }),
  ).rejects.toMatchObject({ code: 'INTERNAL' });
  store.enqueue(rooms, [{ id: ids.third }]);
  store.enqueue(seats, [pageSeat(), pageSeat({ id: ids.second, branchId: ids.first })]);
  await expect(
    readInventorySeatPage(store.transaction, access, ids.third, { limit: 1 }),
  ).rejects.toMatchObject({ code: 'INTERNAL' });
});
