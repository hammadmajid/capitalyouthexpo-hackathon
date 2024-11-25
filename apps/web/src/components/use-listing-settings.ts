import { useRef } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listApprovedAmenities, readListingSettings, saveListingSettings } from '@hsm/api-client';
import type { ListingSettingsInput } from '@hsm/contracts';
import { browserClient } from '../lib/client';
export function useListingSettings(
  actorId: string,
  branchId: string,
  open: boolean,
  onSaved: () => void,
) {
  const cache = useQueryClient(),
    keys = useRef(new Map<string, string>());
  const queryKey = ['private-listing', actorId, branchId];
  const query = useQuery({
    queryKey,
    enabled: open,
    gcTime: 0,
    queryFn: () => readListingSettings(browserClient(), branchId),
  });
  const catalog = useInfiniteQuery({
    queryKey: ['approved-amenities', actorId, branchId],
    enabled: open,
    gcTime: 0,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      listApprovedAmenities(browserClient(), {
        ...(pageParam ? { cursor: pageParam } : {}),
        limit: 20,
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const mutation = useMutation({
    gcTime: 0,
    mutationFn: (command: { version: string; input: ListingSettingsInput }) => {
      const intent = JSON.stringify(command);
      let key = keys.current.get(intent);
      if (!key) {
        key = crypto.randomUUID();
        keys.current.set(intent, key);
      }
      return saveListingSettings(browserClient(), branchId, command.version, command.input, key);
    },
    onSuccess: (result, command) => {
      keys.current.delete(JSON.stringify(command));
      cache.setQueryData(queryKey, result);
      onSaved();
    },
    onError: () => {
      void query.refetch();
    },
  });
  return { query, catalog, mutation };
}
