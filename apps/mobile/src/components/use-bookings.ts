import { useRef } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { listCustomerBookings, cancelCustomerBooking } from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
export function useBookings(actorId: string) {
  const cache = useQueryClient(),
    queryKey = ['customer-bookings', actorId];
  const keys = useRef(new Map<string, string>());
  const query = useInfiniteQuery({
    queryKey,
    gcTime: 0,
    initialPageParam: null,
    queryFn: async ({ pageParam }: { pageParam: string | null }) =>
      listCustomerBookings(await actorClient(actorId), pageParam ? { cursor: pageParam } : {}),
    getNextPageParam: (page) => page.nextCursor,
  });
  const cancel = useMutation({
    gcTime: 0,
    mutationFn: async (input: { id: string; reason: string }) => {
      const command = JSON.stringify(input),
        key = keys.current.get(command) ?? randomUUID();
      keys.current.set(command, key);
      const result = await cancelCustomerBooking(
        await actorClient(actorId),
        input.id,
        input.reason,
        key,
      );
      keys.current.delete(command);
      return result;
    },
    onSuccess: () => cache.invalidateQueries({ queryKey, exact: true }),
  });
  return { query, cancel };
}
