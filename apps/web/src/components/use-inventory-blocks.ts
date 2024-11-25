import { useRef } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listInventoryBlocks,
  createInventoryBlock,
  releaseInventoryBlock,
  readInventoryAccess,
} from '@hsm/api-client';
import type { InventoryBlockInput, InventoryBlockListQuery } from '@hsm/contracts';
import { browserClient } from '../lib/client';
type Command =
  { kind: 'create'; input: InventoryBlockInput } | { kind: 'release'; id: string; reason: string };
export function useInventoryBlocks(
  actorId: string,
  branchId: string,
  state: InventoryBlockListQuery['state'],
  onSaved: (kind: Command['kind']) => void,
) {
  const cache = useQueryClient(),
    keys = useRef(new Map<string, string>());
  const access = useQuery({
    queryKey: ['inventory-access', actorId, branchId],
    gcTime: 0,
    queryFn: () => readInventoryAccess(browserClient(), branchId),
  });
  const blocks = useInfiniteQuery({
    queryKey: ['inventory-blocks', actorId, branchId, state],
    gcTime: 0,
    initialPageParam: null,
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      listInventoryBlocks(browserClient(), branchId, {
        state,
        limit: 20,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor,
  });
  const mutation = useMutation({
    gcTime: 0,
    mutationFn: (command: Command) => {
      const serialized = JSON.stringify(command);
      let key = keys.current.get(serialized);
      if (!key) {
        key = crypto.randomUUID();
        keys.current.set(serialized, key);
      }
      return command.kind === 'create'
        ? createInventoryBlock(browserClient(), branchId, command.input, key)
        : releaseInventoryBlock(browserClient(), branchId, command.id, command.reason, key);
    },
    onSuccess: async (_result, command) => {
      keys.current.delete(JSON.stringify(command));
      onSaved(command.kind);
      await cache.invalidateQueries({ queryKey: ['inventory-blocks', actorId, branchId] });
    },
    onError: () => {
      void access.refetch();
    },
  });
  return { access, blocks, mutation };
}
