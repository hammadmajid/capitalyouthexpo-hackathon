import { expect, it } from 'vitest';
import {
  publicInventoryQuerySchema,
  publicInventoryTypePageSchema,
  publicInventoryRoomPageSchema,
  publicInventoryBedPageSchema,
  publicInventoryRoomSchema,
  publicInventoryBedSchema,
  listingOverviewSchema,
} from './public-inventory-pages.js';
const first = '019a1234-1234-7123-8123-123456789abc',
  second = '019a1234-1234-7123-8123-123456789abd',
  branchId = '019a1234-1234-7123-8123-123456789abe';
const type = {
  id: first,
  name: 'Shared',
  capacity: 2,
  inventoryMode: 'both',
  bedMonthlyRentPaisa: 1800001,
  roomMonthlyRentPaisa: 3200000,
  depositPaisa: 0,
  amenities: [],
  fees: [],
};
const room = { id: first, label: '101', wholeRoomAvailable: null, photoIds: [first] },
  bed = { id: first, label: 'A', available: null, photoIds: [first] };
it('ACC-002 / P2-S1: bounded canonical cursor queries preserve complete half-open date ranges', () => {
  expect(publicInventoryQuerySchema.parse({})).toEqual({ limit: 20 });
  expect(
    publicInventoryQuerySchema.parse({
      cursor: first.toUpperCase(),
      limit: '100',
      moveInDate: '2026-11-01',
      moveOutDate: '2026-11-03',
    }),
  ).toEqual({ cursor: first, limit: 100, moveInDate: '2026-11-01', moveOutDate: '2026-11-03' });
});
it.each([
  { limit: 0 },
  { limit: 101 },
  { limit: 1.1 },
  { cursor: 'bad' },
  { moveInDate: '2026-11-01' },
  { moveOutDate: '2026-11-03' },
  { moveInDate: '2026-11-03', moveOutDate: '2026-11-03' },
  { moveInDate: '2026-11-04', moveOutDate: '2026-11-03' },
  { moveInDate: '2026-02-30', moveOutDate: '2026-03-03' },
  { permissions: ['inventory_edit'] },
])('ACC-002: invalid page/range/private input is rejected: %j', (query) => {
  expect(publicInventoryQuerySchema.safeParse(query).success).toBe(false);
});
it('ACC-002: pages identify exact public parents even when empty', () => {
  expect(publicInventoryTypePageSchema.parse({ branchId, data: [], nextCursor: null })).toEqual({
    branchId,
    data: [],
    nextCursor: null,
  });
  expect(
    publicInventoryRoomPageSchema.safeParse({ branchId, data: [], nextCursor: null }).success,
  ).toBe(false);
  expect(
    publicInventoryBedPageSchema.safeParse({ branchId, data: [], nextCursor: null }).success,
  ).toBe(false);
  expect(
    publicInventoryRoomPageSchema.parse({
      branchId,
      roomTypeId: second,
      data: [room],
      nextCursor: null,
    }).data,
    // ROOM-AMN v2.15: rooms without disclosed amenities default to an empty list.
  ).toEqual([{ ...room, amenities: [] }]);
  expect(
    publicInventoryBedPageSchema.parse({ branchId, roomId: second, data: [bed], nextCursor: null })
      .data,
  ).toEqual([bed]);
});
it('ACC-002: public pages reject duplicate/disordered rows, false continuations and oversized collections', () => {
  const page = { branchId, data: [type], nextCursor: null };
  expect(publicInventoryTypePageSchema.parse(page).data[0]?.bedMonthlyRentPaisa).toBe(1800001);
  for (const changed of [
    { data: [type, type] },
    { data: [{ ...type, id: second }, type] },
    { nextCursor: second },
    { data: [], nextCursor: first },
    { data: Array.from({ length: 101 }, () => type) },
  ])
    expect(publicInventoryTypePageSchema.safeParse({ ...page, ...changed }).success).toBe(false);
});
it('SEC-003: public page rows cannot carry identity, financial status or unavailable reasons', () => {
  expect(
    publicInventoryTypePageSchema.safeParse({
      branchId,
      data: [{ ...type, permissions: ['inventory_edit'] }],
      nextCursor: null,
    }).success,
  ).toBe(false);
  expect(
    publicInventoryRoomPageSchema.safeParse({
      branchId,
      roomTypeId: second,
      data: [{ ...room, occupantName: 'Private' }],
      nextCursor: null,
    }).success,
  ).toBe(false);
  expect(
    publicInventoryBedPageSchema.safeParse({
      branchId,
      roomId: second,
      data: [{ ...bed, unavailableReason: 'Private' }],
      nextCursor: null,
    }).success,
  ).toBe(false);
});
it('ACC-002: overview contains aggregate/public information without physical arrays', () => {
  const value = {
    branchId,
    brandName: 'HSM',
    name: 'Hostel',
    slug: 'hostel',
    category: 'boys',
    city: 'Islamabad',
    area: null,
    latitude: 33.7,
    longitude: 73,
    priceFromPaisa: 1800001,
    verified: true,
    availableBeds: null,
    availableWholeRooms: null,
    amenities: [],
    media: [],
    distanceMeters: null,
    description: null,
    address: 'Public address',
    landmark: null,
    publicPhone: null,
    publicEmail: null,
  };
  expect(listingOverviewSchema.parse(value)).toEqual(value);
  expect(listingOverviewSchema.safeParse({ ...value, roomTypes: [] }).success).toBe(false);
});
it('ROOM-003 / ROOM-004: selectable public rooms and beds always carry bounded published photo identities', () => {
  for (const [schema, value] of [
    [publicInventoryRoomSchema, room],
    [publicInventoryBedSchema, bed],
  ] as const) {
    expect(schema.safeParse(value).success).toBe(true);
    for (const photoIds of [undefined, [], Array.from({ length: 13 }, () => first), ['bad']])
      expect(schema.safeParse({ ...value, photoIds }).success).toBe(false);
  }
});
it('BKG-003 / BKG-005: public room types disclose current fees exactly and reject omitted or duplicate fees', () => {
  const fee = { code: 'mess', cadence: 'monthly', amountPaisa: 300000 };
  expect(
    publicInventoryTypePageSchema.parse({
      branchId,
      data: [{ ...type, fees: [fee] }],
      nextCursor: null,
    }).data[0]?.fees,
  ).toEqual([fee]);
  const withoutFees: Record<string, unknown> = { ...type };
  delete withoutFees.fees;
  for (const value of [
    withoutFees,
    { ...type, fees: [fee, fee] },
    { ...type, fees: [{ ...fee, amountPaisa: 0.5 }] },
  ])
    expect(
      publicInventoryTypePageSchema.safeParse({ branchId, data: [value], nextCursor: null })
        .success,
    ).toBe(false);
});
it('ROOM-AMN v2.15: public rooms carry their effective amenities, bounded and unique', () => {
  const page = (amenities: unknown) =>
    publicInventoryRoomPageSchema.safeParse({
      branchId,
      roomTypeId: second,
      data: [{ ...room, amenities }],
      nextCursor: null,
    });
  expect(page([{ code: 'attached_bath', name: 'Attached bathroom' }]).success).toBe(true);
  expect(
    page([
      { code: 'wifi', name: 'Wi-Fi' },
      { code: 'wifi', name: 'Wi-Fi' },
    ]).success,
  ).toBe(false);
  expect(page([{ code: 'wifi', name: 'Wi-Fi', isActive: true }]).success).toBe(false);
});
