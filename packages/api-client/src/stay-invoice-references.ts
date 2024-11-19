import {
  stayIdentifierSchema,
  stayInvoiceReferenceQuerySchema,
  staffStayInvoiceReferenceQuerySchema,
  stayInvoiceReferencePageSchema,
  invoiceReferencePageMatches,
  type StayInvoiceReferenceQuery,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
function validated(
  value: Awaited<ReturnType<typeof readPage>>,
  stayId: string,
  query: StayInvoiceReferenceQuery,
  branchId?: string,
) {
  if (!invoiceReferencePageMatches(value, stayId, query, branchId))
    throw new ClientFailure('INVALID_RESPONSE');
  return value;
}
function readPage(operation: Parameters<typeof readApi>[0]) {
  return readApi(operation, stayInvoiceReferencePageSchema);
}
// FIN-001 / SEC-003: real named records, no raw invoice-ID entry or inferred paid state.
export async function readStaffStayInvoices(
  client: ApiClient,
  branch: unknown,
  stay: unknown,
  value: unknown = {},
) {
  const branchId = stayIdentifierSchema.parse(branch),
    stayId = stayIdentifierSchema.parse(stay),
    query = staffStayInvoiceReferenceQuerySchema.parse(value);
  const page = await readPage(
    client.GET('/v1/branches/{branchId}/stays/{stayId}/invoices', {
      params: {
        path: { branchId, stayId },
        query: {
          limit: query.limit,
          ...(query.cursor ? { cursor: query.cursor } : {}),
          ...(query.category ? { category: query.category } : {}),
        },
      },
    }),
  );
  return validated(page, stayId, query, branchId);
}
export async function readCustomerStayInvoices(
  client: ApiClient,
  stay: unknown,
  value: unknown = {},
) {
  const stayId = stayIdentifierSchema.parse(stay),
    query = stayInvoiceReferenceQuerySchema.parse(value);
  const page = await readPage(
    client.GET('/v1/me/stays/{stayId}/invoices', {
      params: {
        path: { stayId },
        query: { limit: query.limit, ...(query.cursor ? { cursor: query.cursor } : {}) },
      },
    }),
  );
  return validated(page, stayId, query);
}
