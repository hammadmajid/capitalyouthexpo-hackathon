import { z } from 'zod';
import {
  managementPageSchema,
  bookingPageSchema,
  bookingSummarySchema,
  holdInputSchema,
  holdResponseSchema,
  createBookingInputSchema,
  bookingActionInputSchema,
  type BookingQuoteSnapshot,
  type CreateBookingInput,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { readApi } from './result.js';
import { setupPageQuery } from './owner-setup-body.js';
const identifier = (value: string) => z.string().uuid().parse(value).toLowerCase();
function bookingQuoteBody({
  includedTransport,
  transportRequested,
  transportOffer,
  ...quote
}: BookingQuoteSnapshot) {
  return {
    ...quote,
    ...(includedTransport === undefined ? {} : { includedTransport }),
    ...(transportRequested === undefined ? {} : { transportRequested }),
    ...(transportOffer === undefined ? {} : { transportOffer }),
  };
}
export function listCustomerBookings(
  client: ApiClient,
  page: { cursor?: string; limit?: number } = {},
) {
  return readApi(
    client.GET('/v1/me/bookings', {
      params: { query: setupPageQuery(managementPageSchema.parse(page)) },
    }),
    bookingPageSchema,
  );
}
export function createBookingHold(
  client: ApiClient,
  branchId: string,
  quote: BookingQuoteSnapshot,
  key: string,
) {
  return readApi(
    client.POST('/v1/marketplace/{branchId}/holds', {
      params: {
        path: { branchId: identifier(branchId) },
        header: { 'Idempotency-Key': identifier(key) },
      },
      body: { quote: bookingQuoteBody(holdInputSchema.parse({ quote }).quote) },
    }),
    holdResponseSchema,
  );
}
export function createCustomerBooking(
  client: ApiClient,
  branchId: string,
  input: CreateBookingInput,
  key: string,
) {
  const body = createBookingInputSchema.parse(input);
  return readApi(
    client.POST('/v1/marketplace/{branchId}/bookings', {
      params: {
        path: { branchId: identifier(branchId) },
        header: { 'Idempotency-Key': identifier(key) },
      },
      body: {
        quote: bookingQuoteBody(body.quote),
        documents: body.documents,
        ...(body.holdId === undefined ? {} : { holdId: body.holdId }),
        ...(body.cnic === undefined ? {} : { cnic: body.cnic }),
        ...(body.permanentAddress === undefined ? {} : { permanentAddress: body.permanentAddress }),
      },
    }),
    bookingSummarySchema,
  );
}
export function cancelCustomerBooking(
  client: ApiClient,
  bookingId: string,
  reason: string,
  key: string,
) {
  return readApi(
    client.POST('/v1/me/bookings/{bookingId}/cancel', {
      params: {
        path: { bookingId: identifier(bookingId) },
        header: { 'Idempotency-Key': identifier(key) },
      },
      body: bookingActionInputSchema.parse({ reason }),
    }),
    bookingSummarySchema,
  );
}
