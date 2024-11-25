import { useRef } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listSavedHostels, saveHostel, ClientFailure } from '@hsm/api-client';
import { browserClient } from '../lib/client';
export function useSavedHostels(actorId: string) {
  const queryKey = ['saved-hostels', actorId];
  const query = useInfiniteQuery({
    queryKey,
    gcTime: 0,
    initialPageParam: null,
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      listSavedHostels(browserClient(), { limit: 20, ...(pageParam ? { cursor: pageParam } : {}) }),
    getNextPageParam: (page) => page.nextCursor,
  });
  return { query, mutation: useSavedMutation(actorId) };
}
export function useSavedMutation(actorId: string) {
  const cache = useQueryClient(),
    keys = useRef(new Map<string, string>());
  const queryKey = ['saved-hostels', actorId];
  return useMutation({
    gcTime: 0,
    mutationFn: async (input: { branchId: string; saved: boolean }) => {
      const command = JSON.stringify(input),
        key = keys.current.get(command) ?? crypto.randomUUID();
      keys.current.set(command, key);
      const result = await saveHostel(browserClient(), input.branchId, input.saved, key);
      if (result.branchId !== input.branchId || result.saved !== input.saved)
        throw new ClientFailure('INVALID_RESPONSE');
      return result;
    },
    onSuccess: async (_result, input) => {
      keys.current.delete(JSON.stringify(input));
      await cache.invalidateQueries({ queryKey, exact: true });
    },
  });
}
