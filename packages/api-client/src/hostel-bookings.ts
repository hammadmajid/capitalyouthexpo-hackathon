import { z } from 'zod';
import {
  branchInventorySchema,
  branchBookingPageQuerySchema,
  bookingPageSchema,
  bookingSummarySchema,
  bookingActionInputSchema,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
import { setupPageQuery } from './owner-setup-body.js';
const identifier = (value: string) => z.string().uuid().parse(value).toLowerCase();
const transitions = {
  confirm: '/v1/branches/{branchId}/bookings/{bookingId}/confirm',
  reject: '/v1/branches/{branchId}/bookings/{bookingId}/reject',
  cancel: '/v1/branches/{branchId}/bookings/{bookingId}/cancel',
} as const;
export function listHostelBookings(
  client: ApiClient,
  branchId: string,
  page: { cursor?: string; limit?: number; queue?: 'pending_requests' } = {},
) {
  const scope = identifier(branchId);
  const query = branchBookingPageQuerySchema.parse(page);
  return readApi(
    client.GET('/v1/branches/{branchId}/bookings', {
      params: {
        path: { branchId: scope },
        query: { ...setupPageQuery(query), ...(query.queue ? { queue: query.queue } : {}) },
      },
    }),
    bookingPageSchema,
  ).then((page) => {
    if (page.data.some((row) => row.branchId !== scope))
      throw new ClientFailure('INVALID_RESPONSE');
    return page;
  });
}
export function transitionHostelBooking(
  client: ApiClient,
  branchId: string,
  bookingId: string,
  action: keyof typeof transitions,
  reason: string,
  key: string,
) {
  const branch = identifier(branchId),
    booking = identifier(bookingId);
  const transition = z.enum(['confirm', 'reject', 'cancel']).parse(action);
  return readApi(
    client.POST(transitions[transition], {
      params: {
        path: { branchId: branch, bookingId: booking },
        header: { 'Idempotency-Key': identifier(key) },
      },
      body: bookingActionInputSchema.parse({ reason }),
    }),
    bookingSummarySchema,
  ).then((response) => {
    if (
      response.branchId !== branch ||
      response.id !== booking ||
      response.state !==
        ({ confirm: 'confirmed', reject: 'rejected', cancel: 'cancelled' } as const)[transition]
    )
      throw new ClientFailure('INVALID_RESPONSE');
    return response;
  });
}

export function readBranchInventory(client: ApiClient, branchId: string) {
  return readApi(
    client.GET('/v1/branches/{branchId}/inventory', {
      params: { path: { branchId: identifier(branchId) } },
    }),
    branchInventorySchema,
  );
}
