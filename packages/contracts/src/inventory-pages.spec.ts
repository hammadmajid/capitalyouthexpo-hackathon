import { expect, it } from 'vitest';
import {
  inventoryPageQuerySchema,
  inventoryPageSequenceIsValid,
  inventoryAccessSchema,
  inventoryRoomTypePageSchema,
  inventoryRoomPageSchema,
  inventorySeatPageSchema,
} from './inventory-pages.js';
const first = '019a1234-1234-7123-8123-123456789abc',
  second = '019a1234-1234-7123-8123-123456789abd',
  branchId = '019a1234-1234-7123-8123-123456789abe';
const access = { branchId, permissions: [], canConfigureManagers: false };
const room = {
  id: first,
  branchId,
  roomTypeId: second,
  label: '203',
  status: 'maintenance',
  archivedAt: null,
};
const bed = {
  id: first,
  roomId: second,
  label: 'A',
  ordinal: 2,
  status: 'inactive',
  archivedAt: null,
};
const type = {
  id: first,
  branchId,
  name: 'Shared',
  inventoryMode: 'both',
  capacity: 2,
  bedMonthlyRentPaisa: 1800001,
  roomMonthlyRentPaisa: 3200000,
  depositPaisa: 0,
  fees: [],
  archivedAt: null,
};
it('ROOM-002: page defaults are transport limits and canonical UUID continuations', () => {
  expect(inventoryPageQuerySchema.parse({})).toEqual({ limit: 20 });
  expect(inventoryPageQuerySchema.parse({ cursor: first.toUpperCase(), limit: '100' })).toEqual({
    cursor: first,
    limit: 100,
  });
  for (const query of [
    { limit: 0 },
    { limit: 101 },
    { limit: 1.5 },
    { cursor: 'bad' },
    { offset: 1 },
    { state: 'archived' },
  ])
    expect(inventoryPageQuerySchema.safeParse(query).success).toBe(false);
});
it('ACC-004: access is branch-bound and contains only unique known current permissions', () => {
  expect(inventoryAccessSchema.parse(access)).toEqual(access);
  for (const input of [
    { ...access, permissions: ['unknown'] },
    { ...access, permissions: ['listing_edit', 'listing_edit'] },
    { ...access, occupants: [] },
    { permissions: [], canConfigureManagers: true },
  ])
    expect(inventoryAccessSchema.safeParse(input).success).toBe(false);
});
it('ROOM-002: paging preserves actual private labels, status, ordinal and integer paisa', () => {
  expect(
    inventoryRoomTypePageSchema.parse({ ...access, data: [type], nextCursor: first }).data[0]
      ?.bedMonthlyRentPaisa,
  ).toBe(1800001);
  expect(
    inventoryRoomPageSchema.parse({ ...access, roomTypeId: second, data: [room], nextCursor: null })
      .data,
  ).toEqual([room]);
  expect(
    inventorySeatPageSchema.parse({ ...access, roomId: second, data: [bed], nextCursor: null })
      .data,
  ).toEqual([bed]);
});
it('ACC-004: even empty pages identify their actual branch and selected parent', () => {
  expect(inventoryRoomTypePageSchema.parse({ ...access, data: [], nextCursor: null }).data).toEqual(
    [],
  );
  expect(inventoryRoomPageSchema.safeParse({ ...access, data: [], nextCursor: null }).success).toBe(
    false,
  );
  expect(inventorySeatPageSchema.safeParse({ ...access, data: [], nextCursor: null }).success).toBe(
    false,
  );
});
it('ACC-004: foreign and archived children fail instead of leaking across parent pages', () => {
  for (const row of [
    { ...room, branchId: second },
    { ...room, roomTypeId: first },
    { ...room, archivedAt: '2026-10-17T00:00:00Z' },
    { ...room, seats: [] },
  ])
    expect(
      inventoryRoomPageSchema.safeParse({
        ...access,
        roomTypeId: second,
        data: [row],
        nextCursor: null,
      }).success,
    ).toBe(false);
  for (const row of [
    { ...bed, roomId: first },
    { ...bed, archivedAt: '2026-10-17T00:00:00Z' },
  ])
    expect(
      inventorySeatPageSchema.safeParse({
        ...access,
        roomId: second,
        data: [row],
        nextCursor: null,
      }).success,
    ).toBe(false);
  expect(
    inventoryRoomTypePageSchema.safeParse({
      ...access,
      data: [{ ...type, branchId: first }],
      nextCursor: null,
    }).success,
  ).toBe(false);
  expect(
    inventoryRoomTypePageSchema.safeParse({
      ...access,
      data: [{ ...type, archivedAt: '2026-10-17T00:00:00Z' }],
      nextCursor: null,
    }).success,
  ).toBe(false);
});
it('ROOM-002: repeated, disordered, oversized and false continuations are rejected', () => {
  for (const input of [
    { data: [type, type], nextCursor: null },
    { data: [{ ...type, id: second }, type], nextCursor: null },
    { data: [type], nextCursor: second },
    { data: [], nextCursor: first },
    { data: Array.from({ length: 101 }, () => type), nextCursor: null },
  ])
    expect(inventoryRoomTypePageSchema.safeParse({ ...access, ...input }).success).toBe(false);
});
it('ROOM-002: sequence validates every row including the limit-plus-one probe after a cursor', () => {
  expect(inventoryPageSequenceIsValid([], first)).toBe(true);
  expect(inventoryPageSequenceIsValid([{ id: first }])).toBe(true);
  expect(inventoryPageSequenceIsValid([{ id: second }], first)).toBe(true);
  expect(inventoryPageSequenceIsValid([{ id: first }], first)).toBe(false);
  expect(inventoryPageSequenceIsValid([{ id: second }, { id: first }])).toBe(false);
});
