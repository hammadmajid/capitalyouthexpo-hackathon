import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createBillingCatalogEntry,
  archiveBillingCatalogEntry,
  readBillingCatalog,
} from '@hsm/api-client';
import type { BillingCatalogInput } from '@hsm/contracts';
import { browserClient } from '../lib/client';
export type CatalogAction =
  { kind: 'create'; input: BillingCatalogInput } | { kind: 'archive'; id: string; reason: string };
export function useBillingCatalog(
  actorId: string,
  branchId: string,
  open: boolean,
  unavailable: boolean,
  cursor: string | undefined,
  history: boolean,
  onSaved: (action: CatalogAction) => void,
) {
  const cache = useQueryClient(),
    keys = useRef(new Map<string, string>());
  const prefix = ['approved-charge-catalog', actorId, branchId];
  const query = useQuery({
    queryKey: [...prefix, cursor, history],
    gcTime: 0,
    retry: false,
    enabled: open && !unavailable,
    queryFn: () =>
      readBillingCatalog(browserClient(), branchId, {
        limit: 20,
        ...(cursor ? { cursor } : {}),
        includeArchived: history ? 'true' : 'false',
      }),
  });
  const mutation = useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: (action: CatalogAction) => {
      const intent = JSON.stringify(action);
      let key = keys.current.get(intent);
      if (!key) {
        key = crypto.randomUUID();
        keys.current.set(intent, key);
      }
      return action.kind === 'create'
        ? createBillingCatalogEntry(browserClient(), branchId, action.input, key)
        : archiveBillingCatalogEntry(
            browserClient(),
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
