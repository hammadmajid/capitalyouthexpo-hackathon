import { useRef } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listOwnerManagers,
  readManagerInventoryGrants,
  saveManagerInventoryGrants,
} from '@hsm/api-client';
import type { InventoryPermission } from '@hsm/contracts';
import { browserClient } from '../lib/client';
export function useManagerChoices(actorId: string, branchId: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['grant-manager-choices', actorId, branchId],
    gcTime: 0,
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      listOwnerManagers(browserClient(), branchId, {
        limit: 20,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}
export function useManagerGrants(
  actorId: string,
  branchId: string,
  assignmentId: string,
  onSaved: () => void,
) {
  const cache = useQueryClient(),
    keys = useRef(new Map<string, string>());
  const queryKey = ['manager-grants', actorId, branchId, assignmentId];
  const query = useQuery({
    queryKey,
    gcTime: 0,
    queryFn: () => readManagerInventoryGrants(browserClient(), branchId, assignmentId),
  });
  const mutation = useMutation({
    gcTime: 0,
    mutationFn: (permissions: InventoryPermission[]) => {
      const normalized = [...permissions].sort();
      const intent = JSON.stringify(normalized);
      let key = keys.current.get(intent);
      if (!key) {
        key = crypto.randomUUID();
        keys.current.set(intent, key);
      }
      return saveManagerInventoryGrants(
        browserClient(),
        branchId,
        assignmentId,
        { permissions: normalized },
        key,
      );
    },
    onSuccess: async (_result, permissions) => {
      keys.current.delete(JSON.stringify([...permissions].sort()));
      onSaved();
      await cache.invalidateQueries({ queryKey, exact: true });
    },
    onError: () => {
      void query.refetch();
    },
  });
  return { query, mutation };
}
