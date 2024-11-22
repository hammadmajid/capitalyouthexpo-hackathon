import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { currentRoomTypes as roomTypes, roomTypeFees, rooms, seats } from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { readBranchInventory } from './read.js';
const branchId = randomUUID(),
  typeId = randomUUID(),
  roomId = randomUUID(),
  bedId = randomUUID();
const type = {
  id: typeId,
  name: 'Two beds',
  capacity: 2,
  inventoryMode: 'both',
  bedMonthlyRentPaisa: 1800001n,
  roomMonthlyRentPaisa: 3200000n,
  depositPaisa: 0n,
  archivedAt: null,
};
function fixture() {
  const store = queryFixture();
  store.enqueue(roomTypes, [type]);
  store.enqueue(roomTypeFees, [
    { roomTypeId: typeId, code: 'mess', cadence: 'monthly', amountPaisa: 1001n },
  ]);
  store.enqueue(rooms, [
    { id: roomId, roomTypeId: typeId, label: '101', status: 'active', archivedAt: null },
  ]);
  store.enqueue(seats, [
    { id: bedId, roomId, label: 'A', ordinal: 1, status: 'active', archivedAt: null },
  ]);
  return store;
}
it('BKG-003/004 ACC-004: inventory projection retains exact prices, physical identity and capability context', async () => {
  const store = fixture();
  const result = await readBranchInventory(store.transaction, branchId, {
    permissions: ['inventory_edit'],
    canConfigureManagers: false,
  });
  expect(result.roomTypes[0]?.bedMonthlyRentPaisa).toBe(1800001);
  expect(result.roomTypes[0]?.fees).toEqual([
    { code: 'mess', cadence: 'monthly', amountPaisa: 1001 },
  ]);
  expect(result.rooms[0]?.seats[0]).toMatchObject({ id: bedId, roomId, ordinal: 1 });
  expect(result.canConfigureManagers).toBe(false);
  expect(result.permissions).toEqual(['inventory_edit']);
});
it('ACC-004: empty authorized inventory exposes no invented beds or grants', async () => {
  const store = queryFixture();
  expect(
    await readBranchInventory(store.transaction, branchId, {
      permissions: [],
      canConfigureManagers: false,
    }),
  ).toEqual({ roomTypes: [], rooms: [], permissions: [], canConfigureManagers: false });
});
