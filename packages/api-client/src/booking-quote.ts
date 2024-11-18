import { z } from 'zod';
import { quoteInputSchema, bookingQuoteSnapshotSchema, type QuoteInput } from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { readApi } from './result.js';
export function requestBookingQuote(client: ApiClient, branchId: string, input: QuoteInput) {
  input = quoteInputSchema.parse(input);
  return readApi(
    client.POST('/v1/marketplace/{branchId}/quote', {
      params: { path: { branchId: z.string().uuid().parse(branchId).toLowerCase() } },
      body: {
        target: input.target,
        range: input.range,
        ...(input.transportRequested === undefined
          ? {}
          : { transportRequested: input.transportRequested }),
      },
    }),
    bookingQuoteSnapshotSchema,
  );
}
