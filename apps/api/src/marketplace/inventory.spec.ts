import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { currentRoomTypes as roomTypes, rooms, seats, inventoryClaims } from '@hsm/db';
import { marketplaceQuerySchema } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { publicInventory } from './inventory.js';
const branchId = randomUUID(),
  typeId = randomUUID(),
  roomId = randomUUID(),
  bedA = randomUUID(),
  bedB = randomUUID();
const now = new Date('2026-10-14T12:00:00Z');
const type = {
  id: typeId,
  name: 'Two beds',
  capacity: 2,
  inventoryMode: 'both',
  bedMonthlyRentPaisa: 1800001n,
  roomMonthlyRentPaisa: 3200000n,
  depositPaisa: 0n,
};
const physical = { id: roomId, roomTypeId: typeId, label: '101' };
const beds = [
  { id: bedA, roomId, label: 'A', status: 'active' },
  { id: bedB, roomId, label: 'B', status: 'active' },
];
const range = { moveInDate: '2026-10-15', moveOutDate: '2026-11-15' };
function fixture(types: unknown[] = [type], inventory: unknown[] = beds, claims: unknown[] = []) {
  const store = queryFixture();
  store.enqueue(roomTypes, types);
  store.enqueue(rooms, [physical]);
  store.enqueue(seats, inventory);
  store.enqueue(inventoryClaims, claims);
  return store;
}
it('ACC-002 BKG-004: undated projections show exact prices and never claim availability', async () => {
  const store = fixture();
  const result = await publicInventory(
    store.transaction,
    branchId,
    marketplaceQuerySchema.parse({}),
    now,
  );
  expect(result.priceFromPaisa).toBe(1800001);
  expect(result.availableBeds).toBeNull();
  expect(result.availableWholeRooms).toBeNull();
  expect(result.roomTypes[0]?.rooms[0]?.beds[0]?.available).toBeNull();
  expect(store.predicates.some((value) => value.table === inventoryClaims)).toBe(false);
});
it('ACC-002 ACC-001: one bed reservation leaves the other bed available but blocks the whole room', async () => {
  const store = fixture([type], beds, [
    {
      roomId,
      seatId: bedA,
      ...range,
      holdId: null,
      expiresAt: null,
      customerName: 'Must remain private',
    },
  ]);
  const result = await publicInventory(
    store.transaction,
    branchId,
    marketplaceQuerySchema.parse({ ...range, availableOnly: 'true' }),
    now,
  );
  expect(result.availableBeds).toBe(1);
  expect(result.availableWholeRooms).toBe(0);
  expect(result.priceFromPaisa).toBe(1800001);
  expect(JSON.stringify(result)).not.toContain('Must remain private');
});
it('ACC-001: a whole-room reservation blocks every physical bed', async () => {
  const store = fixture([type], beds, [
    { roomId, seatId: null, ...range, holdId: null, expiresAt: null },
  ]);
  const result = await publicInventory(
    store.transaction,
    branchId,
    marketplaceQuerySchema.parse({ ...range, availableOnly: 'true' }),
    now,
  );
  expect(result.availableBeds).toBe(0);
  expect(result.availableWholeRooms).toBe(0);
  expect(result.priceFromPaisa).toBeNull();
});
it.each([randomUUID(), null])(
  'BKG-006: expired hold/request claim %s does not reduce availability',
  async (holdId) => {
    const store = fixture([type], beds, [
      { roomId, seatId: bedA, ...range, holdId, expiresAt: now },
    ]);
    const result = await publicInventory(
      store.transaction,
      branchId,
      marketplaceQuerySchema.parse(range),
      now,
    );
    expect(result.availableBeds).toBe(2);
    expect(result.availableWholeRooms).toBe(1);
  },
);
it('ACC-001: an inactive physical bed disables whole-room booking without inventing a replacement bed', async () => {
  const store = fixture([type], [beds[0], { ...beds[1], status: 'maintenance' }]);
  const result = await publicInventory(
    store.transaction,
    branchId,
    marketplaceQuerySchema.parse(range),
    now,
  );
  expect(result.availableBeds).toBe(1);
  expect(result.availableWholeRooms).toBe(0);
  expect(result.roomTypes[0]?.rooms[0]?.wholeRoomAvailable).toBe(false);
  expect(result.roomTypes[0]?.rooms[0]?.beds).toHaveLength(1);
});
it.each(['per_bed', 'whole_room'])(
  'BKG-003: inventory mode %s exposes only the bookable unit kind',
  async (inventoryMode) => {
    const store = fixture([
      {
        ...type,
        inventoryMode,
        bedMonthlyRentPaisa: inventoryMode === 'whole_room' ? null : type.bedMonthlyRentPaisa,
        roomMonthlyRentPaisa: inventoryMode === 'per_bed' ? null : type.roomMonthlyRentPaisa,
      },
    ]);
    const result = await publicInventory(
      store.transaction,
      branchId,
      marketplaceQuerySchema.parse(range),
      now,
    );
    expect(result.availableBeds).toBe(inventoryMode === 'per_bed' ? 2 : 0);
    expect(result.availableWholeRooms).toBe(inventoryMode === 'whole_room' ? 1 : 0);
  },
);
it('BKG-004: price filters count the matching whole room rather than nonmatching beds', async () => {
  const store = fixture();
  const result = await publicInventory(
    store.transaction,
    branchId,
    marketplaceQuerySchema.parse({
      ...range,
      minimumRentPaisa: 3000000,
      maximumRentPaisa: 3500000,
    }),
    now,
  );
  expect(result.availableBeds).toBe(0);
  expect(result.availableWholeRooms).toBe(1);
  expect(result.priceFromPaisa).toBe(3200000);
});
it('ACC-002: no public room type produces an honest empty inventory', async () => {
  const store = fixture([]);
  const result = await publicInventory(
    store.transaction,
    branchId,
    marketplaceQuerySchema.parse(range),
    now,
  );
  expect(result.roomTypes).toEqual([]);
  expect(result.priceFromPaisa).toBeNull();
  expect(result.availableBeds).toBe(0);
});

it.each([
  { end: null, start: '2026-10-15', count: 1 },
  { end: '2026-10-10', start: '2026-10-14', count: 1 },
  { end: '2026-10-10', start: '2026-10-15', count: 1 },
  { end: '2026-10-16', start: '2026-10-17', count: 2 },
])(
  'RES-004 / ACC-002: actual occupancy $end at requested $start gives honest private availability',
  async ({ end, start, count }) => {
    const assignmentId = randomUUID();
    const store = fixture([type], beds, [
      {
        roomId,
        seatId: bedA,
        assignmentId,
        moveInDate: '2026-10-01',
        moveOutDate: end,
        holdId: null,
        expiresAt: null,
        residentName: 'Private occupant',
        rentStatus: 'overdue',
      },
    ]);
    const result = await publicInventory(
      store.transaction,
      branchId,
      marketplaceQuerySchema.parse({ moveInDate: start, moveOutDate: '2026-11-15' }),
      now,
    );
    expect(result.availableBeds).toBe(count);
    expect(result.availableWholeRooms).toBe(count === 2 ? 1 : 0);
    expect(JSON.stringify(result)).not.toContain('Private occupant');
    expect(JSON.stringify(result)).not.toContain('overdue');
    expect(JSON.stringify(result)).not.toContain(assignmentId);
  },
);
