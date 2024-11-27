import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { createBookingHold, createCustomerBooking } from '@hsm/api-client';
import type {
  BookingQuoteSnapshot,
  CreateBookingInput,
  bookingSummarySchema,
} from '@hsm/contracts';
import type { z } from 'zod';
import { actorClient } from '../../lib/runtime';
export function useCheckout(actorId: string, branchId: string, quote: BookingQuoteSnapshot) {
  const cache = useQueryClient();
  const holdKey = useRef<string | undefined>(undefined);
  const bookingKeys = useRef(new Map<string, string>());
  const [result, setResult] = useState<z.infer<typeof bookingSummarySchema>>();
  const hold = useMutation({
    gcTime: 0,
    mutationFn: async () => {
      holdKey.current ??= randomUUID();
      return createBookingHold(await actorClient(actorId), branchId, quote, holdKey.current);
    },
  });
  const book = useMutation({
    gcTime: 0,
    mutationFn: async (input: CreateBookingInput) => {
      const command = JSON.stringify(input);
      let key = bookingKeys.current.get(command);
      if (!key) {
        key = randomUUID();
        bookingKeys.current.set(command, key);
      }
      return createCustomerBooking(await actorClient(actorId), branchId, input, key);
    },
    onSuccess: async (booking) => {
      setResult(booking);
      bookingKeys.current.clear();
      await cache.invalidateQueries({ queryKey: ['customer-bookings', actorId], exact: true });
    },
  });
  return { hold, book, result };
}
