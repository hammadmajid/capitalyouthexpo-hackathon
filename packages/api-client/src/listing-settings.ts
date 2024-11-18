import { z } from 'zod';
import {
  amenityCatalogPageSchema,
  amenityCatalogQuerySchema,
  listingSettingsInputSchema,
  listingVersionSchema,
  privateListingSchema,
  type AmenityCatalogQuery,
  type PrivateListing,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
const identifier = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
function sameBranch(result: PrivateListing, branchId: string) {
  if (result.branchId !== branchId) throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export async function readListingSettings(client: ApiClient, branchId: string) {
  const branch = identifier.parse(branchId);
  return sameBranch(
    await readApi(
      client.GET('/v1/branches/{branchId}/listing', {
        params: { path: { branchId: branch } },
      }),
      privateListingSchema,
    ),
    branch,
  );
}
export async function saveListingSettings(
  client: ApiClient,
  branchId: string,
  version: string,
  input: unknown,
  key: string,
) {
  const branch = identifier.parse(branchId),
    body = listingSettingsInputSchema.parse(input),
    expectedVersion = listingVersionSchema.parse(version),
    commandKey = identifier.parse(key);
  const result = await readApi(
    client.PUT('/v1/branches/{branchId}/listing', {
      params: {
        path: { branchId: branch },
        header: { 'If-Match': '"' + expectedVersion + '"', 'Idempotency-Key': commandKey },
      },
      body,
    }),
    privateListingSchema,
  );
  return sameBranch(result, branch);
}
export async function listApprovedAmenities(
  client: ApiClient,
  input: Partial<AmenityCatalogQuery> = {},
) {
  const query = amenityCatalogQuerySchema.parse(input);
  return readApi(
    client.GET('/v1/marketplace/amenities', {
      params: { query: { limit: query.limit, ...(query.cursor ? { cursor: query.cursor } : {}) } },
    }),
    amenityCatalogPageSchema,
  );
}
