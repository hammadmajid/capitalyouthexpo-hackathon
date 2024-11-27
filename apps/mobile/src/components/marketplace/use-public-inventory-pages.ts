import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  listPublicInventoryRoomTypes,
  listPublicInventoryRooms,
  listPublicInventoryBeds,
} from '@hsm/api-client';
import type { StayRange } from '@hsm/contracts';
import { client } from '../../lib/runtime';
type Position = { parentId: string; cursor: string };
export function usePublicInventoryPages(branchId: string, range?: StayRange) {
  const [typeCursor, setTypeCursor] = useState<string>(),
    [typeChoice, setTypeChoice] = useState<string>(),
    [roomChoice, setRoomChoice] = useState<string>();
  const [roomPosition, setRoomPosition] = useState<Position>(),
    [bedPosition, setBedPosition] = useState<Position>();
  const key = [
    'public-inventory-pages',
    branchId,
    range?.moveInDate ?? null,
    range?.moveOutDate ?? null,
  ];
  const page = (cursor?: string) => ({ limit: 20, ...range, ...(cursor ? { cursor } : {}) });
  const types = useQuery({
    queryKey: [...key, 'types', typeCursor],
    gcTime: 0,
    queryFn: () => listPublicInventoryRoomTypes(client, branchId, page(typeCursor)),
  });
  const type = types.data?.data.find((row) => row.id === typeChoice) ?? types.data?.data[0];
  const roomCursor =
    roomPosition && roomPosition.parentId === type?.id ? roomPosition.cursor : undefined;
  const rooms = useQuery({
    queryKey: [...key, 'rooms', type?.id, roomCursor],
    gcTime: 0,
    enabled: Boolean(type) && !types.isError,
    queryFn: () => {
      if (!type) throw new Error('Select a public room type');
      return listPublicInventoryRooms(client, branchId, type.id, page(roomCursor));
    },
  });
  const room = rooms.data?.data.find((row) => row.id === roomChoice) ?? rooms.data?.data[0];
  const bedCursor =
    bedPosition && bedPosition.parentId === room?.id ? bedPosition.cursor : undefined;
  const bedEnabled = Boolean(type && room) && type?.inventoryMode !== 'whole_room';
  const beds = useQuery({
    queryKey: [...key, 'beds', room?.id, bedCursor],
    gcTime: 0,
    enabled: bedEnabled && !types.isError && !rooms.isError,
    queryFn: () => {
      if (!room) throw new Error('Select a public room');
      return listPublicInventoryBeds(client, branchId, room.id, page(bedCursor));
    },
  });
  const error = types.error ?? (type ? rooms.error : null) ?? (bedEnabled ? beds.error : null);
  function chooseType(id?: string) {
    setTypeChoice(id);
    setRoomChoice(undefined);
    setRoomPosition(undefined);
    setBedPosition(undefined);
  }
  function chooseRoom(id?: string) {
    setRoomChoice(id);
    setBedPosition(undefined);
  }
  function firstTypes() {
    setTypeCursor(undefined);
    chooseType();
  }
  function nextTypes() {
    if (types.data?.nextCursor) {
      setTypeCursor(types.data.nextCursor);
      chooseType();
    }
  }
  function firstRooms() {
    setRoomPosition(undefined);
    chooseRoom();
  }
  function nextRooms() {
    if (type && rooms.data?.nextCursor) {
      setRoomPosition({ parentId: type.id, cursor: rooms.data.nextCursor });
      chooseRoom();
    }
  }
  function firstBeds() {
    setBedPosition(undefined);
  }
  function nextBeds() {
    if (room && beds.data?.nextCursor)
      setBedPosition({ parentId: room.id, cursor: beds.data.nextCursor });
  }
  async function retry() {
    const current = await types.refetch();
    if (current.isError) return;
    if (!type || !current.data?.data.some((row) => row.id === type.id)) {
      chooseType();
      return;
    }
    const physical = await rooms.refetch();
    if (physical.isError) return;
    if (!room || !physical.data?.data.some((row) => row.id === room.id)) {
      chooseRoom();
      return;
    }
    if (bedEnabled) await beds.refetch();
  }
  return {
    types,
    rooms,
    beds,
    type,
    room,
    bedEnabled,
    error,
    typeCursor,
    roomCursor,
    bedCursor,
    chooseType,
    chooseRoom,
    firstTypes,
    nextTypes,
    firstRooms,
    nextRooms,
    firstBeds,
    nextBeds,
    retry,
  };
}
