import { useNativeInventoryPages } from './use-native-inventory-pages';
import { useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { changeInventoryState } from '@hsm/api-client';
import { inventoryStateInputSchema } from '@hsm/contracts';
import { actorClient } from '../lib/runtime';
export type NativeInventoryCommand = {
  kind: 'room' | 'seat';
  id: string;
  status: 'active' | 'inactive' | 'maintenance';
  reason: string;
};
export function useNativeInventory(
  actorId: string,
  branchId: string,
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
  const { queryKey, query, paging } = useNativeInventoryPages(actorId, branchId, open);
  const mutation = useMutation({
    gcTime: 0,
    mutationFn: async (command: NativeInventoryCommand) => {
      const input = inventoryStateInputSchema.parse({
        status: command.status,
        reason: command.reason,
      });
      const intent = JSON.stringify({ kind: command.kind, id: command.id, ...input });
      const key = keys.current.get(intent) ?? randomUUID();
      keys.current.set(intent, key);
      return changeInventoryState(
        await actorClient(actorId),
        branchId,
        command.kind,
        command.id,
        input,
        key,
      );
    },
    onError: () => {
      if (active.current) void query.refetch();
    },
    onSuccess: async () => {
      if (!active.current) return;
      keys.current.clear();
      onSaved();
      await Promise.all([
        cache.invalidateQueries({ queryKey }),
        cache.invalidateQueries({ queryKey: ['marketplace'] }),
        cache.invalidateQueries({ queryKey: ['marketplace-details', branchId] }),
        cache.invalidateQueries({ queryKey: ['availability', branchId] }),
      ]);
    },
  });
  return { query, mutation, paging, clearKeys: () => keys.current.clear() };
}
