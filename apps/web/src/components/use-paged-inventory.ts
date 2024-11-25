import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ApiFailure,
  listInventoryRoomTypes,
  listInventoryRooms,
  listInventoryBeds,
} from '@hsm/api-client';
import { browserClient } from '../lib/client';
const page = (cursor?: string) => ({ limit: 20, ...(cursor ? { cursor } : {}) });
type ChildPosition = { parentId: string; cursor: string };
export function usePagedInventory(actorId: string, branchId: string) {
  const [typeCursor, setTypeCursor] = useState<string>(),
    [typeChoice, setTypeChoice] = useState<string>(),
    [roomChoice, setRoomChoice] = useState<string>(),
    [roomPosition, setRoomPosition] = useState<ChildPosition>(),
    [bedPosition, setBedPosition] = useState<ChildPosition>();
  const queryKey = ['branch-inventory-pages', actorId, branchId];
  const types = useQuery({
    queryKey: [...queryKey, 'types', typeCursor],
    gcTime: 0,
    queryFn: () => listInventoryRoomTypes(browserClient(), branchId, page(typeCursor)),
  });
  const type =
    types.data?.data.find((row) => row.id === typeChoice && !row.archivedAt) ??
    types.data?.data.find((row) => !row.archivedAt);
  const roomCursor = roomPosition?.parentId === type?.id ? roomPosition?.cursor : undefined;
  const rooms = useQuery({
    queryKey: [...queryKey, 'rooms', type?.id, roomCursor],
    gcTime: 0,
    enabled: Boolean(type) && !types.isError,
    queryFn: () => {
      if (!type) throw new Error('Select a room type');
      return listInventoryRooms(browserClient(), branchId, type.id, page(roomCursor));
    },
  });
  const room =
    rooms.data?.data.find((row) => row.id === roomChoice && !row.archivedAt) ??
    rooms.data?.data.find((row) => !row.archivedAt);
  const bedCursor = bedPosition?.parentId === room?.id ? bedPosition?.cursor : undefined;
  const beds = useQuery({
    queryKey: [...queryKey, 'beds', room?.id, bedCursor],
    gcTime: 0,
    enabled: Boolean(type && room) && !types.isError && !rooms.isError,
    queryFn: () => {
      if (!room) throw new Error('Select a room');
      return listInventoryBeds(browserClient(), branchId, room.id, page(bedCursor));
    },
  });
  const error = types.error ?? (type ? rooms.error : null) ?? (room ? beds.error : null);
  const unavailable = error instanceof ApiFailure && error.code === 'NOT_FOUND';
  const ready = types.data && (!type || (rooms.data && (!room || beds.data)));
  const authority = [
    types.data,
    ...(type ? [rooms.data] : []),
    ...(room ? [beds.data] : []),
  ].filter((value) => value !== undefined);
  const data =
    ready && !unavailable && types.data
      ? {
          roomTypes: types.data.data,
          rooms: (type ? (rooms.data?.data ?? []) : []).map((row) => ({
            ...row,
            seats: row.id === room?.id ? (beds.data?.data ?? []) : [],
          })),
          permissions: types.data.permissions.filter((permission) =>
            authority.every((source) => source.permissions.includes(permission)),
          ),
          canConfigureManagers: authority.every((source) => source.canConfigureManagers),
        }
      : undefined;
  async function refetch() {
    const result = await types.refetch();
    if (result.isError) return { isError: true };
    if (!type || !result.data?.data.some((row) => row.id === type.id && !row.archivedAt))
      return { isError: false };
    const physical = await rooms.refetch();
    if (physical.isError) return { isError: true };
    if (!room || !physical.data?.data.some((row) => row.id === room.id && !row.archivedAt))
      return { isError: false };
    return { isError: (await beds.refetch()).isError };
  }
  function selectType(value: string | undefined) {
    setTypeChoice(value);
    setRoomChoice(undefined);
    setRoomPosition(undefined);
    setBedPosition(undefined);
  }
  function selectRoom(value: string) {
    setRoomChoice(value);
    setBedPosition(undefined);
  }
  function firstTypes() {
    setTypeCursor(undefined);
    selectType(undefined);
  }
  function nextTypes() {
    if (types.data?.nextCursor) {
      setTypeCursor(types.data.nextCursor);
      selectType(undefined);
    }
  }
  function firstRooms() {
    setRoomPosition(undefined);
    setRoomChoice(undefined);
    setBedPosition(undefined);
  }
  function nextRooms() {
    if (type && rooms.data?.nextCursor) {
      setRoomPosition({ parentId: type.id, cursor: rooms.data.nextCursor });
      setRoomChoice(undefined);
      setBedPosition(undefined);
    }
  }
  function firstBeds() {
    setBedPosition(undefined);
  }
  function nextBeds() {
    if (room && beds.data?.nextCursor)
      setBedPosition({ parentId: room.id, cursor: beds.data.nextCursor });
  }
  return {
    queryKey,
    access: types.data,
    query: {
      data,
      error,
      isError: Boolean(error),
      isPending: !error && !ready,
      isFetching:
        types.isFetching ||
        (Boolean(type) && rooms.isFetching) ||
        (Boolean(room) && beds.isFetching),
      refetch,
    },
    paging: {
      typeCursor,
      roomCursor,
      bedCursor,
      selectedTypeId: type?.id,
      selectedRoomId: room?.id,
      nextTypeCursor: types.data?.nextCursor,
      nextRoomCursor: rooms.data?.nextCursor,
      nextBedCursor: beds.data?.nextCursor,
      selectType,
      selectRoom,
      firstTypes,
      nextTypes,
      firstRooms,
      nextRooms,
      firstBeds,
      nextBeds,
    },
  };
}
export type InventoryPaging = ReturnType<typeof usePagedInventory>['paging'];
