import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { listNotifications, markNotificationRead } from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
export function useInbox(actorId: string, enabled = true) {
  const cache = useQueryClient(),
    queryKey = ['private-inbox', actorId];
  const query = useInfiniteQuery({
    queryKey,
    enabled,
    gcTime: 0,
    initialPageParam: null,
    queryFn: async ({ pageParam }: { pageParam: string | null }) =>
      listNotifications(await actorClient(actorId), pageParam ? { cursor: pageParam } : {}),
    getNextPageParam: (page) => page.nextCursor,
  });
  const mark = useMutation({
    gcTime: 0,
    mutationFn: async (id: string) =>
      markNotificationRead(await actorClient(actorId), id, randomUUID()),
    onSuccess: () => cache.invalidateQueries({ queryKey }),
  });
  return { query, mark };
}
