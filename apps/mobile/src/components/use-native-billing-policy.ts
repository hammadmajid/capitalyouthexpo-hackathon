import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { readBillingSettings, saveBillingSettings } from '@hsm/api-client';
import type { BillingPolicy, BillingSettingsTarget } from '@hsm/contracts';
import { actorClient } from '../lib/runtime';
export function useNativeBillingPolicy(
  actorId: string,
  target: BillingSettingsTarget,
  open: boolean,
  unavailable: boolean,
  onSaved: () => void,
) {
  const cache = useQueryClient(),
    keys = useRef(new Map<string, string>());
  const queryKey = ['billing-policy', actorId, target.branchId, target.roomTypeId ?? 'branch'];
  const query = useQuery({
    queryKey,
    gcTime: 0,
    retry: false,
    enabled: open && !unavailable,
    queryFn: async () => readBillingSettings(await actorClient(actorId), target),
  });
  const mutation = useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: async (policy: BillingPolicy) => {
      const intent = JSON.stringify(policy),
        key = keys.current.get(intent) ?? randomUUID();
      keys.current.set(intent, key);
      return saveBillingSettings(await actorClient(actorId), target, { policy }, key);
    },
    onSuccess: async (_result, policy) => {
      keys.current.delete(JSON.stringify(policy));
      onSaved();
      await cache.invalidateQueries({ queryKey, exact: true });
    },
  });
  return { query, mutation };
}
