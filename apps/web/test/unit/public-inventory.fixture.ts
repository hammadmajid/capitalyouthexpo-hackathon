import { vi } from 'vitest';
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
  vi.mocked(listPublicInventoryRoomTypes).mockImplementation(async (_client, branchId) => ({
    branchId,
    data: [publicType],
    nextCursor: null,
  }));
  vi.mocked(listPublicInventoryRooms).mockImplementation(
    async (_client, branchId, roomTypeId, page) => ({
      branchId,
      roomTypeId,
      data: [{ ...publicRoom, wholeRoomAvailable: publicQuery(page).moveInDate ? true : null }],
      nextCursor: null,
    }),
  );
  vi.mocked(listPublicInventoryBeds).mockImplementation(
    async (_client, branchId, roomId, page) => ({
      branchId,
      roomId,
      data: [{ ...publicBed, available: publicQuery(page).moveInDate ? true : null }],
      nextCursor: null,
    }),
  );
}

export const publicBranchId = id;
export const publicOverview = {
  branchId: id,
  brandName: 'Actual hostel',
  name: 'Actual branch',
  slug: 'actual-branch',
  category: 'boys' as const,
  city: 'Islamabad',
  area: null,
  latitude: 33.7,
  longitude: 73.1,
  priceFromPaisa: 1800001,
  verified: true as const,
  availableBeds: null,
  availableWholeRooms: null,
  amenities: [],
  media: [],
  distanceMeters: null,
  description: 'Actual description',
  address: 'Actual address',
  landmark: null,
  publicPhone: null,
  publicEmail: null,
};
