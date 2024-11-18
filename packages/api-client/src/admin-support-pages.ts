import {
  supportMessagePageSchema,
  supportMessageQuerySchema,
  supportStaffQuerySchema,
  supportTicketPageSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
function defined<T extends object>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
}
export function readAdminSupportQueue(client: ApiClient, query: unknown = {}) {
  const input = supportStaffQuerySchema.parse(query);
  return readApi(
    client.GET('/v1/admin/support-tickets', { params: { query: defined(input) } }),
    supportTicketPageSchema,
  );
}
export async function readAdminSupportMessages(
  client: ApiClient,
  ticketId: unknown,
  query: unknown = {},
) {
  const ticket = stayIdentifierSchema.parse(ticketId),
    input = supportMessageQuerySchema.parse(query);
  const page = await readApi(
    client.GET('/v1/admin/support-tickets/{ticketId}/messages', {
      params: { path: { ticketId: ticket }, query: defined(input) },
    }),
    supportMessagePageSchema,
  );
  if (page.ticketId !== ticket) throw new ClientFailure('INVALID_RESPONSE');
  return page;
}
export async function readOwnSupportMessages(
  client: ApiClient,
  ticketId: unknown,
  query: unknown = {},
) {
  const ticket = stayIdentifierSchema.parse(ticketId),
    input = supportMessageQuerySchema.parse(query);
  const page = await readApi(
    client.GET('/v1/support/tickets/{ticketId}/messages', {
      params: { path: { ticketId: ticket }, query: defined(input) },
    }),
    supportMessagePageSchema,
  );
  if (page.ticketId !== ticket || page.data.some((row) => row.internal))
    throw new ClientFailure('INVALID_RESPONSE');
  return page;
}
