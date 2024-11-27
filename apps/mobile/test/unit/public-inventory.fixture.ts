/// <reference types="jest" />
import {
  listPublicInventoryRoomTypes,
  listPublicInventoryRooms,
  listPublicInventoryBeds,
} from '@hsm/api-client';
import { publicInventoryQuerySchema } from '@hsm/contracts';
export function publicQuery(value: unknown) {
  return publicInventoryQuerySchema.parse(value ?? {});
}
const id = '019a1234-1234-7123-8123-123456789abc';
export const publicType = {
  id,
  name: 'Two beds',
  capacity: 2,
  inventoryMode: 'both' as const,
  bedMonthlyRentPaisa: 1800001,
  roomMonthlyRentPaisa: 3200000,
  depositPaisa: 0,
  fees: [],
  amenities: [{ code: 'wifi', name: 'Wi-Fi' }],
};
export const publicRoom = { id, label: '101', wholeRoomAvailable: null, photoIds: [id] };
export const publicBed = { id, label: 'A', available: null, photoIds: [id] };
export function setPublicInventory() {
  jest.mocked(listPublicInventoryRoomTypes).mockImplementation(async (_client, branchId) => ({
    branchId,
    data: [publicType],
    nextCursor: null,
  }));
  jest
    .mocked(listPublicInventoryRooms)
    .mockImplementation(async (_client, branchId, roomTypeId, page) => ({
      branchId,
      roomTypeId,
      data: [{ ...publicRoom, wholeRoomAvailable: publicQuery(page).moveInDate ? true : null }],
      nextCursor: null,
    }));
  jest
    .mocked(listPublicInventoryBeds)
    .mockImplementation(async (_client, branchId, roomId, page) => ({
      branchId,
      roomId,
      data: [{ ...publicBed, available: publicQuery(page).moveInDate ? true : null }],
      nextCursor: null,
    }));
}
