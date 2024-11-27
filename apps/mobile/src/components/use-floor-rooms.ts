import { readPropertyOccupancy } from '../lib/property-occupancy';
import { collectPropertyPages } from '../lib/property-pages';
import { useQueries, useQuery } from '@tanstack/react-query';
import {
  attachListingImage,
  createInventoryBed,
  createInventoryRoom,
  createSetupRoom,
  createPropertyBuilding,
  createPropertyFloor,
  readBranchInventory,
  readPropertyBuildings,
  readPropertyFloors,
  readPropertyRoomLocation,
  saveInventoryRoomType,
  savePropertyRoomLocation,
  type ApiClient,
} from '@hsm/api-client';
import type { RoomInput, RoomTypeInput, SeatInput, SetupRoomInput } from '@hsm/contracts';
import { actorClient } from '../lib/runtime';
import { withFreshSession } from '../lib/fresh-session';
import { useNativeCommand } from './services/use-command';
export type FloorCommand =
  | { kind: 'building'; name: string; sortOrder: number }
  | { kind: 'floor'; buildingId: string; label: string; levelNumber: number }
  | { kind: 'type'; input: RoomTypeInput }
  | { kind: 'room'; input: RoomInput }
  | { kind: 'setup_room'; input: SetupRoomInput }
  | { kind: 'bed'; roomId: string; input: SeatInput }
  | { kind: 'locate'; roomId: string; floorId: string; expectedVersion: number }
  | { kind: 'photo'; fileId: string; altText: string; roomId: string; bedId?: string };
export function runFloorCommand(
  client: ApiClient,
  branchId: string,
  body: FloorCommand,
  key: string,
) {
  switch (body.kind) {
    case 'building':
      return createPropertyBuilding(
        client,
        branchId,
        { name: body.name, sortOrder: body.sortOrder },
        key,
      );
    case 'floor':
      return createPropertyFloor(
        client,
        branchId,
        { buildingId: body.buildingId, label: body.label, levelNumber: body.levelNumber },
        key,
      );
    case 'type':
      return saveInventoryRoomType(client, branchId, body.input, key);
    case 'setup_room':
      return createSetupRoom(client, branchId, body.input, key);
    case 'room':
      return createInventoryRoom(client, branchId, body.input, key);
    case 'bed':
      return createInventoryBed(client, branchId, body.roomId, body.input, key);
    case 'locate':
      return savePropertyRoomLocation(
        client,
        branchId,
        body.roomId,
        {
          floorId: body.floorId,
          expectedVersion: body.expectedVersion,
          reason: 'Room placed on its floor during setup',
        },
        key,
      );
    case 'photo':
      return attachListingImage(
        client,
        branchId,
        {
          fileId: body.fileId,
          altText: body.altText,
          sortOrder: 0,
          target: body.bedId
            ? { kind: 'bed', roomId: body.roomId, bedId: body.bedId }
            : { kind: 'room', roomId: body.roomId },
        },
        key,
      );
  }
}
// Property structure (0059) + inventory + room/bed galleries for one authorised branch.
// Building → Floor → Room → Bed (user direction 2026-10-29); a hostel may have many buildings.
export function useFloorRooms(actorId: string, branchId: string) {
  const read = <T>(work: (client: ApiClient) => Promise<T>) =>
    withFreshSession(async () => work(await actorClient(actorId)));
  const base = ['floor-rooms', actorId, branchId];
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
  const floorsError = floorPages.find((page) => page.error)?.error ?? null;
  const inventory = useQuery({
    queryKey: ['branch-inventory-pages', actorId, branchId, 'summary'],
    retry: false,
    queryFn: () => read((c) => readBranchInventory(c, branchId)),
  });
  const occupancy = useQuery({
    queryKey: ['bed-board', actorId, branchId, 'structure-counts'],
    retry: false,
    enabled: inventory.data?.permissions.includes('stay_manage') ?? false,
    queryFn: () => read((client) => readPropertyOccupancy(client, branchId)),
  });
  const rooms = (inventory.data?.rooms ?? []).filter((room) => !room.archivedAt);
  // CHG-048: one occupancy read (rooms with building and floor) places every room, instead of
  // one location request per room. Per-room reads remain only as a fallback without it.
  const occupancyFloors = Boolean(occupancy.data);
  const useFallback = Boolean(inventory.data) && (!occupancy.isEnabled || occupancy.isError);
  const locations = useQueries({
    queries: rooms.map((room) => ({
      queryKey: [...base, 'location', room.id],
      retry: false,
      enabled: useFallback,
      queryFn: () => read((c) => readPropertyRoomLocation(c, branchId, room.id)),
    })),
  });
  const command = useNativeCommand<FloorCommand>(
    'floor-rooms:' + branchId,
    actorId,
    (client, body, key) => runFloorCommand(client, branchId, body, key),
    [
      base,
      ['branch-inventory-pages', actorId, branchId],
      ['owner-gallery', actorId, branchId],
      ['bed-board', actorId, branchId],
    ],
  );
  // The room's floor (with its building name), or null when it is not placed yet.
  function floorOf(roomId: string): { floor: RoomFloor | null } | undefined {
    if (occupancyFloors) {
      const room = occupancy.data?.find((row) => row.id === roomId);
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
  return {
    actorId,
    branchId,
    buildings,
    buildingList,
    floors,
    floorsError,
    locationsLoading: occupancyFloors
      ? false
      : useFallback
        ? locations.some((query) => query.isPending)
        : occupancy.isPending,
    locationsError: useFallback ? (locations.find((query) => query.error)?.error ?? null) : null,
    inventory,
    occupancy,
    rooms,
    floorOf,
    command,
    read,
  };
}
export type FloorRooms = ReturnType<typeof useFloorRooms>;
type RoomFloor = { id: string; label: string; buildingId: string; buildingName: string };
