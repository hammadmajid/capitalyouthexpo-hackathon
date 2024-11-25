import { useEffect, useRef } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listApprovedAmenities,
  readRoomTypeAmenities,
  saveRoomTypeAmenities,
} from '@hsm/api-client';
import type { RoomAmenitiesInput } from '@hsm/contracts';
import { browserClient } from '../lib/client';
export function useRoomAmenities(
  actorId: string,
  branchId: string,
  roomTypeId: string,
  open: boolean,
  onSaved: () => void,
) {
  const cache = useQueryClient(),
    keys = useRef(new Map<string, string>()),
    active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const queryKey = ['room-amenities', actorId, branchId, roomTypeId];
  const query = useQuery({
    queryKey,
    enabled: open,
    gcTime: 0,
    queryFn: () => readRoomTypeAmenities(browserClient(), branchId, roomTypeId),
  });
  const catalog = useInfiniteQuery({
    queryKey: ['room-amenity-catalog', actorId, branchId, roomTypeId],
    enabled: open && query.data?.canEdit === true,
    gcTime: 0,
    initialPageParam: null,
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      listApprovedAmenities(browserClient(), {
        limit: 20,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor,
  });
  const mutation = useMutation({
    gcTime: 0,
    mutationFn: (command: { version: string; input: RoomAmenitiesInput }) => {
      const input = { amenityCodes: [...command.input.amenityCodes].sort() },
        intent = JSON.stringify({ version: command.version, input });
      let key = keys.current.get(intent);
      if (!key) {
        key = crypto.randomUUID();
        keys.current.set(intent, key);
      }
      return saveRoomTypeAmenities(
        browserClient(),
        branchId,
        roomTypeId,
        command.version,
        input,
        key,
      );
    },
    onSuccess: (result) => {
      if (!active.current) return;
      keys.current.clear();
      cache.setQueryData(queryKey, result);
      onSaved();
      void cache.invalidateQueries({ queryKey: ['marketplace'] });
      void cache.invalidateQueries({ queryKey: ['marketplace-details', branchId] });
    },
    onError: () => {
      if (active.current) void query.refetch();
    },
  });
  return { query, catalog, mutation, clearKeys: () => keys.current.clear() };
}
