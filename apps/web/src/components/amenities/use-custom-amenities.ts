'use client';
import { useInfiniteQuery } from '@tanstack/react-query';
import { readCustomAmenities, saveCustomAmenity } from '@hsm/api-client';
import type { CustomAmenityCommand } from '@hsm/contracts';
import { browserClient } from '../../lib/client';
import { useCommand } from '../services/use-command';
export function customAmenitiesKey(actorId: string, branchId: string) {
  return ['custom-amenities', actorId, branchId];
}
// LIST-00x: an Owner's own amenity names, shared by the hostel listing and each room.
export function useCustomAmenities(actorId: string, branchId: string, enabled = true) {
  const query = useInfiniteQuery({
    queryKey: customAmenitiesKey(actorId, branchId),
    enabled,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      readCustomAmenities(browserClient(), branchId, {
        limit: 30,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const command = useCommand<CustomAmenityCommand>(
    'custom-amenities:' + branchId,
    (body, key) => saveCustomAmenity(browserClient(), branchId, body, key),
    [
      customAmenitiesKey(actorId, branchId),
      ['private-listing', actorId, branchId],
      ['room-amenities', actorId, branchId],
    ],
  );
  return {
    query,
    command,
    rows: query.data?.pages.flatMap((page) => page.data) ?? [],
    canEdit: query.data?.pages[0]?.canEdit ?? false,
  };
}
