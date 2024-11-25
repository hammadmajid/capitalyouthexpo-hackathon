import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ClientFailure, createBookingHold, createCustomerBooking } from '@hsm/api-client';
import {
  createBookingInputSchema,
  type BookingQuoteSnapshot,
  type CreateBookingInput,
  type bookingSummarySchema,
} from '@hsm/contracts';
import type { z } from 'zod';
import { browserClient } from '../lib/client';
import { requireCheckoutSnapshot } from '../lib/checkout-response';
export function useMarketplaceCheckout(
  actorId: string,
  branchId: string,
  quote: BookingQuoteSnapshot,
) {
  const cache = useQueryClient(),
    holdKey = useRef<string | undefined>(undefined),
    keys = useRef(new Map<string, string>());
  const [result, setResult] = useState<z.infer<typeof bookingSummarySchema>>();
  const hold = useMutation({
    gcTime: 0,
    mutationFn: async () => {
      holdKey.current ??= crypto.randomUUID();
      const response = await createBookingHold(browserClient(), branchId, quote, holdKey.current);
      requireCheckoutSnapshot(response, branchId, quote);
      return response;
    },
  });
  const book = useMutation({
    gcTime: 0,
    mutationFn: async (input: CreateBookingInput) => {
      const body = createBookingInputSchema.parse(input);
      requireCheckoutSnapshot(
        { branchId: branchId.toLowerCase(), quote: body.quote },
        branchId,
        quote,
      );
      const intent = JSON.stringify(body);
      let key = keys.current.get(intent);
      if (!key) {
        key = crypto.randomUUID();
        keys.current.set(intent, key);
      }
      const response = await createCustomerBooking(browserClient(), branchId, body, key);
      requireCheckoutSnapshot(response, branchId, quote);
      if (
        response.state !==
        (quote.policy.bookingMode === 'instant' ? 'confirmed' : 'pending_request')
      )
        throw new ClientFailure('INVALID_RESPONSE');
      return response;
    },
    onSuccess: async (booking) => {
      setResult(booking);
      keys.current.clear();
      await cache.invalidateQueries({ queryKey: ['customer-bookings', actorId] });
    },
  });
  return { hold, book, result };
}
