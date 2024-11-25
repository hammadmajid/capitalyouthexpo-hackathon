import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import {
  listInventoryRoomTypes,
  listInventoryRooms,
  listInventoryBeds,
  type readBranchInventory,
} from '@hsm/api-client';
export const branchId = randomUUID(),
  actorId = randomUUID(),
  typeId = randomUUID(),
  roomId = randomUUID(),
  seatId = randomUUID();
export const type = {
  id: typeId,
  branchId,
  name: 'Two beds',
  inventoryMode: 'both' as const,
  capacity: 2,
  bedMonthlyRentPaisa: 1800001,
  roomMonthlyRentPaisa: 3200000,
  depositPaisa: 0,
  fees: [],
  archivedAt: null,
};
export const inventory = {
  roomTypes: [type],
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
  permissions: ['inventory_edit' as const, 'pricing_edit' as const],
  canConfigureManagers: true,
};

type Inventory = Awaited<ReturnType<typeof readBranchInventory>>;
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
  vi.mocked(listInventoryRoomTypes).mockResolvedValue(typePage(value, scope));
  vi.mocked(listInventoryRooms).mockImplementation(async (_client, branch, roomTypeId) => ({
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
  vi.mocked(listInventoryBeds).mockImplementation(async (_client, branch, roomId) => ({
    branchId: branch,
    roomId,
    permissions: value.permissions,
    canConfigureManagers: value.canConfigureManagers,
    data: value.rooms.find((row) => row.id === roomId)?.seats ?? [],
    nextCursor: null,
  }));
}
