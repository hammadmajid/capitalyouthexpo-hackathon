import {
  amenityCatalogQuerySchema,
  customAmenityCommandSchema,
  customAmenityPageSchema,
  customAmenitySchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
export async function readCustomAmenities(client: ApiClient, branch: string, value: unknown = {}) {
  const branchId = stayIdentifierSchema.parse(branch),
    query = amenityCatalogQuerySchema.parse(value);
  const result = await readApi(
    client.GET('/v1/branches/{branchId}/listing/custom-amenities', {
      params: {
        path: { branchId },
        query: { limit: query.limit, ...(query.cursor ? { cursor: query.cursor } : {}) },
      },
    }),
    customAmenityPageSchema,
  );
  const codes = result.data.map((row) => row.code);
  if (
    codes.some(
      (code, index) =>
        (query.cursor !== undefined && code <= query.cursor) ||
        (index > 0 && code <= (codes[index - 1] ?? '')),
    ) ||
    (result.nextCursor !== null &&
      (codes.length !== query.limit || result.nextCursor !== codes.at(-1))) ||
    result.branchId !== branchId ||
    result.data.some((row) => row.organizationId !== result.organizationId) ||
    result.data.length > query.limit
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export async function saveCustomAmenity(
  client: ApiClient,
  branch: string,
  value: unknown,
  key: string,
) {
  const branchId = stayIdentifierSchema.parse(branch),
    body = customAmenityCommandSchema.parse(value);
  const result = await readApi(
    client.POST('/v1/branches/{branchId}/listing/custom-amenities', {
      params: {
        path: { branchId },
        header: { 'Idempotency-Key': stayIdentifierSchema.parse(key) },
      },
      body,
    }),
    customAmenitySchema,
  );
  if (
    (body.kind !== 'create' && result.code !== body.code) ||
    (body.kind === 'archive'
      ? result.isActive
      : !result.isActive || result.name !== body.name || result.category !== body.category)
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
