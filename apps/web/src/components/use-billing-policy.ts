import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { readBillingSettings, saveBillingSettings } from '@hsm/api-client';
import type { BillingPolicy, BillingSettingsTarget } from '@hsm/contracts';
import { browserClient } from '../lib/client';
export function useBillingPolicy(
  actorId: string,
  target: BillingSettingsTarget,
  open: boolean,
  unavailable: boolean,
  onSaved: () => void,
) {
  const cache = useQueryClient(),
    keys = useRef(new Map<string, string>()),
    queryKey = ['billing-policy', actorId, target.branchId, target.roomTypeId ?? 'branch'];
  const query = useQuery({
    queryKey,
    gcTime: 0,
    retry: false,
    enabled: open && !unavailable,
    queryFn: () => readBillingSettings(browserClient(), target),
  });
  const mutation = useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: (policy: BillingPolicy) => {
      const intent = JSON.stringify(policy);
      let key = keys.current.get(intent);
      if (!key) {
        key = crypto.randomUUID();
        keys.current.set(intent, key);
      }
      return saveBillingSettings(browserClient(), target, { policy }, key);
    },
    onSuccess: async (_result, policy) => {
      keys.current.delete(JSON.stringify(policy));
      onSaved();
      await cache.invalidateQueries({ queryKey, exact: true });
    },
  });
  return { query, mutation };
}
