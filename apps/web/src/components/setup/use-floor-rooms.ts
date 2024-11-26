'use client';
import { useQueries, useQuery } from '@tanstack/react-query';
import {
  readBranchInventory,
  readPropertyBuildings,
  readPropertyFloors,
  readPropertyRoomLocation,
  type ApiClient,
} from '@hsm/api-client';
import { browserClient } from '../../lib/client';
import { collectPropertyPages } from '../../lib/property-pages';
import { readPropertyOccupancy } from '../../lib/property-occupancy';
import { useCommand } from '../services/use-command';
import { runFloorCommand, type FloorCommand } from './floor-command';
type RoomFloor = { id: string; label: string; buildingId: string; buildingName: string };
export const floorRoomsKey = (actorId: string, branchId: string) => [
  'floor-rooms',
  actorId,
  branchId,
];
// BRN-001: property structure + inventory for one authorised branch (mobile parity:
// apps/mobile/src/components/use-floor-rooms.ts). Building → Floor → Room → Bed.
export function useFloorRooms(actorId: string, branchId: string) {
  const read = <T>(work: (client: ApiClient) => Promise<T>) => work(browserClient());
  const base = floorRoomsKey(actorId, branchId);
  const buildings = useQuery({
    queryKey: [...base, 'buildings'],
    retry: false,
    queryFn: () =>
      read((c) =>
        collectPropertyPages((cursor) =>
          readPropertyBuildings(c, branchId, { limit: 100, ...(cursor ? { cursor } : {}) }),
        ),
      ),
  });
  const buildingList = (buildings.data?.data ?? []).filter((row) => !row.archivedAt);
  const floorPages = useQueries({
    queries: buildingList.map((building) => ({
      queryKey: [...base, 'floors', building.id],
      retry: false,
      queryFn: () =>
        read((c) =>
          collectPropertyPages((cursor) =>
            readPropertyFloors(c, branchId, building.id, {
              limit: 100,
              ...(cursor ? { cursor } : {}),
            }),
          ),
        ),
    })),
  });
  const floors = buildingList.map((building, index) => ({
    building,
    floors: (floorPages[index]?.data?.data ?? []).filter((row) => !row.archivedAt),
    query: floorPages[index],
  }));
  const inventory = useQuery({
    queryKey: ['branch-inventory-pages', actorId, branchId, 'summary'],
    retry: false,
    queryFn: () => read((c) => readBranchInventory(c, branchId)),
  });
  const canSeeStays = inventory.data?.permissions.includes('stay_manage') ?? false;
  const occupancy = useQuery({
    queryKey: ['bed-board', actorId, branchId, 'structure-counts'],
    retry: false,
    enabled: canSeeStays,
    queryFn: () => read((client) => readPropertyOccupancy(client, branchId)),
  });
  const rooms = (inventory.data?.rooms ?? []).filter((room) => !room.archivedAt);
  // CHG-048: one occupancy read places every room; per-room reads are only a fallback.
  const useFallback = Boolean(inventory.data) && (!occupancy.isEnabled || occupancy.isError);
  const locations = useQueries({
    queries: rooms.map((room) => ({
      queryKey: [...base, 'location', room.id],
      retry: false,
      enabled: useFallback,
      queryFn: () => read((c) => readPropertyRoomLocation(c, branchId, room.id)),
    })),
  });
  const command = useCommand<FloorCommand>(
    'floor-rooms:' + branchId,
    (body, key) => runFloorCommand(browserClient(), branchId, body, key),
    [base, ['branch-inventory-pages', actorId, branchId], ['bed-board', actorId, branchId]],
  );
  function floorOf(roomId: string): { floor: RoomFloor | null } | undefined {
    if (occupancy.data) {
      const room = occupancy.data.find((row) => row.id === roomId);
      if (!room) return undefined;
      return {
        floor: room.floor
          ? {
              id: room.floor.id,
              label: room.floor.label,
              buildingId: room.building?.id ?? '',
              buildingName: room.building?.name ?? '',
            }
          : null,
      };
    }
    return locations[rooms.findIndex((room) => room.id === roomId)]?.data;
  }
  const canEdit =
    (inventory.data?.permissions ?? []).includes('inventory_edit') &&
    (buildings.data?.canEdit ?? false);
  return {
    actorId,
    branchId,
    buildings,
    buildingList,
    floors,
    floorsError: floorPages.find((page) => page.error)?.error ?? null,
    locationsError: useFallback ? (locations.find((query) => query.error)?.error ?? null) : null,
    inventory,
    occupancy,
    canSeeStays,
    canEdit,
    rooms,
    floorOf,
    command,
    read,
  };
}
export type FloorRooms = ReturnType<typeof useFloorRooms>;
export type FloorRoom = FloorRooms['rooms'][number];
