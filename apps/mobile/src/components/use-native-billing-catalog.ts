import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import {
  createBillingCatalogEntry,
  archiveBillingCatalogEntry,
  readBillingCatalog,
} from '@hsm/api-client';
import type { BillingCatalogInput } from '@hsm/contracts';
import { actorClient } from '../lib/runtime';
export type NativeCatalogAction =
  { kind: 'create'; input: BillingCatalogInput } | { kind: 'archive'; id: string; reason: string };
export function useNativeBillingCatalog(
  actorId: string,
  branchId: string,
  open: boolean,
  unavailable: boolean,
  cursor: string | undefined,
  history: boolean,
  onSaved: (action: NativeCatalogAction) => void,
) {
  const cache = useQueryClient(),
    keys = useRef(new Map<string, string>());
  const prefix = ['approved-charge-catalog', actorId, branchId];
  const query = useQuery({
    queryKey: [...prefix, cursor, history],
    gcTime: 0,
    retry: false,
    enabled: open && !unavailable,
    queryFn: async () =>
      readBillingCatalog(await actorClient(actorId), branchId, {
        limit: 20,
        ...(cursor ? { cursor } : {}),
        includeArchived: history ? 'true' : 'false',
      }),
  });
  const mutation = useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: async (action: NativeCatalogAction) => {
      const intent = JSON.stringify(action),
        key = keys.current.get(intent) ?? randomUUID();
      keys.current.set(intent, key);
      const client = await actorClient(actorId);
      return action.kind === 'create'
        ? createBillingCatalogEntry(client, branchId, action.input, key)
        : archiveBillingCatalogEntry(
            client,
            { branchId, catalogId: action.id },
            { reason: action.reason },
            key,
          );
    },
    onSuccess: async (_result, action) => {
      keys.current.delete(JSON.stringify(action));
      onSaved(action);
      await cache.invalidateQueries({ queryKey: prefix });
    },
  });
  return { query, mutation };
}
