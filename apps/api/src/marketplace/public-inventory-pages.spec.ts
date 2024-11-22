import { expect, it, vi } from 'vitest';
import { branches, currentRoomTypes as roomTypes, rooms, seats, roomTypeAmenities } from '@hsm/db';
import { publicInventoryQuerySchema } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { pageIds, pageType, pageRoom, pageSeat } from '../../test/unit/inventory-pages.fixture.js';
import { PublicInventoryPages } from './public-inventory-pages.js';
import { selectableMedia } from './selectable-media.js';
const branchId = pageIds.branch,
  query = publicInventoryQuerySchema.parse({ limit: 1 });
function fixture() {
  const store = queryFixture();
  store.enqueue(branches, [{ id: branchId }]);
  return { ...store, reader: new PublicInventoryPages(store.database) };
}
it('ACC-002 / P2-S1: first type page validates the probe and returns exact paisa and current public amenities', async () => {
  const store = fixture();
  const transaction = vi.spyOn(store.database, 'transaction');
  store.enqueue(roomTypes, [pageType(), pageType({ id: pageIds.second })]);
  store.enqueue(roomTypeAmenities, [{ roomTypeId: pageIds.first, code: 'wifi', name: 'Wi-Fi' }]);
  expect(await store.reader.types(branchId, query)).toMatchObject({
    branchId,
    data: [
      {
        id: pageIds.first,
        bedMonthlyRentPaisa: 1800001,
        amenities: [{ code: 'wifi', name: 'Wi-Fi' }],
      },
    ],
    nextCursor: pageIds.first,
  });
  expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
    isolationLevel: 'repeatable read',
    accessMode: 'read only',
  });
  expect(store.operations).toContainEqual({ table: roomTypes, kind: 'limit', args: [2] });
  expect(store.operations).toContainEqual({ table: roomTypeAmenities, kind: 'limit', args: [201] });
});
it('ACC-002: an approved empty type page is an actual successful empty response', async () => {
  const store = fixture();
  store.enqueue(roomTypes, []);
  expect(await store.reader.types(branchId, query)).toEqual({
    branchId,
    data: [],
    nextCursor: null,
  });
});
it('ACC-002: a withdrawn branch is unavailable rather than an empty inventory', async () => {
  const empty = queryFixture();
  await expect(
    new PublicInventoryPages(empty.database).types(branchId, query),
  ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
});
it.each(
  [
    [pageType({ branchId: pageIds.third })],
    [pageType({ archivedAt: new Date() })],
    [pageType({ id: pageIds.second }), pageType()],
    [pageType(), pageType()],
    [pageType(), pageType({ id: pageIds.second, depositPaisa: 9007199254740992n })],
  ].map((rows) => ({ rows })),
)('ACC-002: corrupt or out-of-scope type/probe metadata fails safely', async ({ rows }) => {
  const store = fixture();
  store.enqueue(roomTypes, rows);
  await expect(store.reader.types(branchId, query)).rejects.toMatchObject({
    code: 'INTERNAL',
    status: 500,
  });
});
it('ACC-002: room pages request only the active selected parent and have exact continuation', async () => {
  const store = fixture();
  store.enqueue(roomTypes, [pageType({ id: pageIds.third })]);
  store.enqueue(rooms, [
    { ...pageRoom({ status: 'active' }), wholeRoomAvailable: null },
    { ...pageRoom({ id: pageIds.second, status: 'active' }), wholeRoomAvailable: null },
  ]);
  store.enqueue(selectableMedia, [
    { owner: pageIds.first, id: pageIds.third },
    { owner: pageIds.second, id: pageIds.first },
  ]);
  expect(await store.reader.rooms(branchId, pageIds.third, query)).toEqual({
    branchId,
    roomTypeId: pageIds.third,
    data: [
      {
        id: pageIds.first,
        label: '203',
        wholeRoomAvailable: null,
        photoIds: [pageIds.third],
        // ROOM-AMN v2.15: effective room amenities are disclosed (none configured here).
        amenities: [],
      },
    ],
    nextCursor: pageIds.first,
  });
  expect(store.operations).toContainEqual({ table: rooms, kind: 'limit', args: [2] });
});
it('ACC-002: dated room metadata cannot claim unknown availability', async () => {
  const store = fixture();
  store.enqueue(roomTypes, [pageType({ id: pageIds.third })]);
  store.enqueue(rooms, [{ ...pageRoom({ status: 'active' }), wholeRoomAvailable: null }]);
  await expect(
    store.reader.rooms(
      branchId,
      pageIds.third,
      publicInventoryQuerySchema.parse({ moveInDate: '2026-11-01', moveOutDate: '2026-11-03' }),
    ),
  ).rejects.toMatchObject({ code: 'INTERNAL' });
});
it('SEC-003: foreign/archived type parents remain hidden', async () => {
  const store = fixture();
  store.enqueue(roomTypes, [pageType({ branchId: pageIds.third })]);
  await expect(store.reader.rooms(branchId, pageIds.first, query)).rejects.toMatchObject({
    code: 'NOT_FOUND',
    status: 404,
  });
});
it('ACC-002: bed pages expose only current public labels/availability and exact IDs', async () => {
  const store = fixture();
  store.enqueue(rooms, [
    { roomId: pageIds.third, branchId, roomTypeId: pageIds.second, inventoryMode: 'both' },
  ]);
  store.enqueue(seats, [
    { ...pageSeat({ status: 'active' }), available: null, monthlyRentPaisa: 1800001n },
    {
      ...pageSeat({ id: pageIds.second, status: 'active' }),
      available: null,
      monthlyRentPaisa: 1800001n,
    },
  ]);
  store.enqueue(selectableMedia, [
    { owner: pageIds.first, id: pageIds.third },
    { owner: pageIds.second, id: pageIds.first },
  ]);
  expect(await store.reader.beds(branchId, pageIds.third, query)).toEqual({
    branchId,
    roomId: pageIds.third,
    data: [
      {
        id: pageIds.first,
        label: 'A',
        available: null,
        monthlyRentPaisa: 1800001,
        photoIds: [pageIds.third],
      },
    ],
    nextCursor: pageIds.first,
  });
});
it('ACC-002: whole-room-only inventory has no separately bookable bed page', async () => {
  const store = fixture();
  store.enqueue(rooms, [
    { roomId: pageIds.third, branchId, roomTypeId: pageIds.second, inventoryMode: 'whole_room' },
  ]);
  expect(await store.reader.beds(branchId, pageIds.third, query)).toEqual({
    branchId,
    roomId: pageIds.third,
    data: [],
    nextCursor: null,
  });
  expect(store.operations.some((row) => row.table === seats && row.kind === 'limit')).toBe(false);
});
it.each([
  { status: 'inactive' as const },
  { branchId: pageIds.second },
  { roomId: pageIds.second },
  { available: true },
])('SEC-003: invalid/inactive/foreign/undated bed metadata is rejected', async (change) => {
  const store = fixture();
  store.enqueue(rooms, [
    { roomId: pageIds.third, branchId, roomTypeId: pageIds.second, inventoryMode: 'both' },
  ]);
  store.enqueue(seats, [
    { ...pageSeat({ status: 'active' }), available: null, monthlyRentPaisa: 1800001n, ...change },
  ]);
  await expect(store.reader.beds(branchId, pageIds.third, query)).rejects.toMatchObject({
    code: 'INTERNAL',
  });
});
it('ROOM-003 / SEAT-002: a page row without its published photo fails closed instead of appearing selectable', async () => {
  const store = fixture();
  store.enqueue(rooms, [
    { roomId: pageIds.third, branchId, roomTypeId: pageIds.second, inventoryMode: 'both' },
  ]);
  store.enqueue(seats, [
    { ...pageSeat({ status: 'active' }), available: null, monthlyRentPaisa: 1800001n },
  ]);
  store.enqueue(selectableMedia, []);
  await expect(store.reader.beds(branchId, pageIds.third, query)).rejects.toMatchObject({
    code: 'INTERNAL',
  });
});
