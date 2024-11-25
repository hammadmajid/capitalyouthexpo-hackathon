import { useRef } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import type { z } from 'zod';
import { bookingPageSchema } from '@hsm/contracts';
import { listCustomerBookings, cancelCustomerBooking, ClientFailure } from '@hsm/api-client';
import { browserClient } from '../lib/client';
type Page = z.infer<typeof bookingPageSchema>;
export function useCustomerBookings(actorId: string, onSaved: () => void) {
  const cache = useQueryClient(),
    keys = useRef(new Map<string, string>());
  const queryKey = ['customer-bookings', actorId];
  const query = useInfiniteQuery({
    queryKey,
    gcTime: 0,
    initialPageParam: null,
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      listCustomerBookings(browserClient(), {
        limit: 20,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor,
  });
  const cancel = useMutation({
    gcTime: 0,
    mutationFn: async (input: { id: string; reason: string }) => {
      const command = JSON.stringify(input),
        key = keys.current.get(command) ?? crypto.randomUUID();
      keys.current.set(command, key);
      const result = await cancelCustomerBooking(browserClient(), input.id, input.reason, key);
      if (result.id !== input.id || result.state !== 'cancelled')
        throw new ClientFailure('INVALID_RESPONSE');
      return result;
    },
    onSuccess: async (result, input) => {
      keys.current.delete(JSON.stringify(input));
      cache.setQueryData<InfiniteData<Page>>(queryKey, (current) =>
        current
          ? {
              ...current,
              pages: current.pages.map((page) => ({
                ...page,
                data: page.data.map((booking) => (booking.id === result.id ? result : booking)),
              })),
            }
          : current,
      );
      onSaved();
      await cache.invalidateQueries({ queryKey, exact: true });
    },
    onError: () => {
      void query.refetch();
    },
  });
  return { query, cancel, clearKeys: () => keys.current.clear() };
}
