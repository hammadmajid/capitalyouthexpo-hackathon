/// <reference types="jest" />
import {
  listInventoryRoomTypes,
  listInventoryRooms,
  listInventoryBeds,
  type readBranchInventory,
} from '@hsm/api-client';
export const actorId = '019a1234-1234-7123-8123-123456789abc',
  branchId = '019a1234-1234-7123-8123-123456789abd',
  typeId = '019a1234-1234-7123-8123-123456789abe',
  roomId = '019a1234-1234-7123-8123-123456789abf',
  seatId = '019a1234-1234-7123-8123-123456789ac0';
export const inventory = {
  roomTypes: [
    {
      id: typeId,
      branchId,
      name: 'Two beds',
      inventoryMode: 'both' as const,
      capacity: 2,
      bedMonthlyRentPaisa: 1800001,
      roomMonthlyRentPaisa: 3200000,
      depositPaisa: 0,
      fees: [{ code: 'mess' as const, amountPaisa: 500000, cadence: 'monthly' as const }],
      archivedAt: null,
    },
  ],
  rooms: [
    {
      id: roomId,
      branchId,
      roomTypeId: typeId,
      label: '101',
      status: 'active' as const,
      archivedAt: null,
      seats: [
        { id: seatId, roomId, label: 'A', ordinal: 1, status: 'active' as const, archivedAt: null },
      ],
    },
  ],
  permissions: ['inventory_edit' as const],
  canConfigureManagers: false,
};

type Inventory = Awaited<ReturnType<typeof readBranchInventory>>;
export function inventoryRoom() {
  const value = inventory.rooms[0];
  if (!value) throw new Error('Missing fixture room');
  return value;
}
export function typePage(value: Inventory, scope = branchId) {
  return {
    branchId: scope,
    permissions: value.permissions,
    canConfigureManagers: value.canConfigureManagers,
    data: value.roomTypes,
    nextCursor: null,
  };
}
export function setInventory(value: Inventory, scope = branchId) {
  jest.mocked(listInventoryRoomTypes).mockResolvedValue(typePage(value, scope));
  jest.mocked(listInventoryRooms).mockImplementation(async (_client, branch, roomTypeId) => ({
    branchId: branch,
    roomTypeId,
    permissions: value.permissions,
    canConfigureManagers: value.canConfigureManagers,
    data: value.rooms
      .filter((row) => row.roomTypeId === roomTypeId)
      .map((row) => ({
        id: row.id,
        branchId: row.branchId,
        roomTypeId: row.roomTypeId,
        label: row.label,
        status: row.status,
        archivedAt: row.archivedAt,
      })),
    nextCursor: null,
  }));
  jest.mocked(listInventoryBeds).mockImplementation(async (_client, branch, roomId) => ({
    branchId: branch,
    roomId,
    permissions: value.permissions,
    canConfigureManagers: value.canConfigureManagers,
    data: value.rooms.find((row) => row.id === roomId)?.seats ?? [],
    nextCursor: null,
  }));
}
