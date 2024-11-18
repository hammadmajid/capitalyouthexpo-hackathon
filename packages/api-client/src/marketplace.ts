import { marketplaceWireQuery } from './marketplace-query.js';
import { z } from 'zod';
import {
  listingPageSchema,
  marketplacePageSchema,
  listingDetailsSchema,
  institutionPageSchema,
  marketplaceQuerySchema,
  stayRangeSchema,
  favoriteInputSchema,
  favoriteStateSchema,
  managementPageSchema,
  type MarketplaceQuery,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
import { setupPageQuery } from './owner-setup-body.js';
export function listMarketplace(client: ApiClient, query: Partial<MarketplaceQuery> = {}) {
  const input = marketplaceQuerySchema.parse({
    ...query,
    ids: query.ids?.join(','),
    amenities: query.amenities?.join(','),
    availableOnly: query.availableOnly === undefined ? undefined : String(query.availableOnly),
  });
  return readApi(
    client.GET('/v1/marketplace', {
      params: {
        query: marketplaceWireQuery(input),
      },
    }),
    marketplacePageSchema,
  );
}
export async function marketplaceDetails(
  client: ApiClient,
  branchId: string,
  dates: { moveInDate?: string; moveOutDate?: string } = {},
) {
  const id = z
    .string()
    .uuid()
    .transform((value) => value.toLowerCase())
    .parse(branchId);
  const value = await readApi(
    client.GET('/v1/marketplace/{branchId}', {
      params: {
        path: { branchId: id },
        query: Object.keys(dates).length ? stayRangeSchema.parse(dates) : {},
      },
    }),
    listingDetailsSchema,
  );
  if (value.branchId !== id) throw new ClientFailure('INVALID_RESPONSE');
  return value;
}
export function marketplaceInstitutions(
  client: ApiClient,
  query: {
    q?: string;
    cursor?: string;
    limit?: number;
    radiusMeters?: number;
  } = {},
) {
  return readApi(
    client.GET('/v1/marketplace/institutions', { params: { query } }),
    institutionPageSchema,
  );
}
export function listSavedHostels(
  client: ApiClient,
  page: { cursor?: string; limit?: number } = {},
) {
  return readApi(
    client.GET('/v1/me/favorites', {
      params: { query: setupPageQuery(managementPageSchema.parse(page)) },
    }),
    listingPageSchema,
  );
}
export function saveHostel(client: ApiClient, branchId: string, saved: boolean, key: string) {
  return readApi(
    client.PUT('/v1/me/favorites/{branchId}', {
      params: {
        path: { branchId: z.string().uuid().parse(branchId) },
        header: { 'Idempotency-Key': z.string().uuid().parse(key) },
      },
      body: favoriteInputSchema.parse({ saved }),
    }),
    favoriteStateSchema,
  );
}
