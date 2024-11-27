jest.mock('../lib/runtime', () => ({
  actorClient: async () => ({}),
  sessions: { restore: jest.fn() },
}));
jest.mock('../lib/fresh-session', () => ({ withFreshSession: (work: () => unknown) => work() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '019a1234-1234-7123-8123-000000000099' }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual<typeof import('@hsm/api-client')>('@hsm/api-client'),
  readPropertyBuildings: jest.fn(),
  readPropertyFloors: jest.fn(),
  readBranchInventory: jest.fn(),
  readBranchOccupancy: jest.fn(),
  readPropertyRoomLocation: jest.fn(),
  listListingGallery: jest.fn(),
}));
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  listListingGallery,
  readBranchInventory,
  readBranchOccupancy,
  readPropertyBuildings,
  readPropertyFloors,
  readPropertyRoomLocation,
} from '@hsm/api-client';
import { useFloorRooms } from './use-floor-rooms';
const id = (n: number) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const branchId = id(1),
  building = { id: id(2), name: 'Block B' },
  floor = { id: id(3), label: 'Floor 1', levelNumber: 1 };
const rooms = Array.from({ length: 15 }, (_, n) => ({
  id: id(100 + n),
  label: String(101 + n),
  archivedAt: null,
  seats: [1, 2, 3, 4].map((b) => ({ id: id(1000 + n * 10 + b), archivedAt: null })),
}));
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(readPropertyBuildings)
    .mockResolvedValue({ data: [{ ...building, archivedAt: null }], nextCursor: null } as never);
  jest
    .mocked(readPropertyFloors)
    .mockResolvedValue({ data: [{ ...floor, archivedAt: null }], nextCursor: null } as never);
  jest
    .mocked(readBranchInventory)
    .mockResolvedValue({ permissions: ['stay_manage', 'inventory_edit'], rooms } as never);
  jest.mocked(readBranchOccupancy).mockResolvedValue({
    data: rooms.map((room, n) => ({
      id: room.id,
      label: room.label,
      building,
      floor: n === 14 ? null : floor,
      beds: [],
    })),
    nextCursor: null,
  } as never);
});
it('CHG-048: 15 rooms are placed from one occupancy read, with no per-room or per-bed requests', async () => {
  const { result } = await renderHook(() => useFloorRooms('owner', branchId), { wrapper });
  await waitFor(() => expect(result.current.floorOf(rooms[0]?.id ?? '')).toBeDefined());
  expect(result.current.floorOf(rooms[0]?.id ?? '')).toEqual({
    floor: { id: floor.id, label: 'Floor 1', buildingId: building.id, buildingName: 'Block B' },
  });
  // An unplaced room is reported as such (not as "still loading").
  expect(result.current.floorOf(rooms[14]?.id ?? '')).toEqual({ floor: null });
  expect(result.current.locationsLoading).toBe(false);
  expect(readBranchOccupancy).toHaveBeenCalledTimes(1);
  expect(readPropertyRoomLocation).not.toHaveBeenCalled();
  expect(listListingGallery).not.toHaveBeenCalled();
});
it('falls back to per-room location reads only without the occupancy grant', async () => {
  jest
    .mocked(readBranchInventory)
    .mockResolvedValue({ permissions: ['inventory_edit'], rooms: rooms.slice(0, 2) } as never);
  jest.mocked(readPropertyRoomLocation).mockResolvedValue({ floor: null, version: 1 } as never);
  const { result } = await renderHook(() => useFloorRooms('owner', branchId), { wrapper });
  await waitFor(() => expect(readPropertyRoomLocation).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(result.current.locationsLoading).toBe(false));
  expect(readBranchOccupancy).not.toHaveBeenCalled();
});
