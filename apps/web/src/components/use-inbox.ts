import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listNotifications, markNotificationRead } from '@hsm/api-client';
import { browserClient } from '../lib/client';
export function useInbox(actorId: string, enabled: boolean) {
  const cache = useQueryClient(),
    queryKey = ['private-inbox', actorId];
  const query = useInfiniteQuery({
    queryKey,
    enabled,
    retry: false,
    gcTime: 0,
    initialPageParam: null,
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      listNotifications(browserClient(), pageParam ? { cursor: pageParam } : {}),
    getNextPageParam: (page) => page.nextCursor,
  });
  const mark = useMutation({
    retry: false,
    gcTime: 0,
    mutationFn: (id: string) => markNotificationRead(browserClient(), id, crypto.randomUUID()),
    onSuccess: () => cache.invalidateQueries({ queryKey }),
  });
  return { query, mark };
}
