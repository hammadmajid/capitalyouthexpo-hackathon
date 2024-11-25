import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  readBookingSettings,
  saveBookingSettings,
  type BookingPolicyTarget,
} from '@hsm/api-client';
import { browserClient } from '../lib/client';
export function useBookingPolicySettings(
  actorId: string,
  target: BookingPolicyTarget,
  open: boolean,
  onSaved: () => void,
) {
  const cache = useQueryClient(),
    keys = useRef(new Map<string, string>());
  const queryKey = ['booking-policy', actorId, target];
  const query = useQuery({
    queryKey,
    enabled: open,
    gcTime: 0,
    queryFn: () => readBookingSettings(browserClient(), target),
  });
  const mutation = useMutation({
    gcTime: 0,
    mutationFn: (input: unknown) => {
      const intent = JSON.stringify(input);
      let key = keys.current.get(intent);
      if (!key) {
        key = crypto.randomUUID();
        keys.current.set(intent, key);
      }
      return saveBookingSettings(browserClient(), target, input, key);
    },
    onSuccess: async (_result, input) => {
      keys.current.delete(JSON.stringify(input));
      onSaved();
      await cache.invalidateQueries({ queryKey, exact: true });
    },
    onError: () => {
      void query.refetch();
    },
  });
  return { query, mutation, clearKeys: () => keys.current.clear() };
}
