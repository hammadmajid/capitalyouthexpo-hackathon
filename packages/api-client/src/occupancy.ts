import {
  bedOccupancyQuerySchema,
  bedOccupancySchema,
  occupancyPageSchema,
  occupancyQuerySchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
// BED-001 / RES-004: the Bed Board read; the response must belong to the requested branch
// and page, and only occupied beds may name an occupant (enforced by the contract).
export async function readBranchOccupancy(
  client: ApiClient,
  branch: unknown,
  inputQuery: unknown = {},
) {
  const branchId = stayIdentifierSchema.parse(branch),
    query = occupancyQuerySchema.parse(inputQuery);
  const page = await readApi(
    client.GET('/v1/branches/{branchId}/occupancy', {
      params: {
        path: { branchId },
        query: {
          limit: query.limit,
          ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
          ...(query.on === undefined ? {} : { on: query.on }),
          ...(query.roomTypeId === undefined ? {} : { roomTypeId: query.roomTypeId }),
          ...(query.roomId === undefined ? {} : { roomId: query.roomId }),
          ...(query.state === undefined ? {} : { state: query.state }),
        },
      },
    }),
    occupancyPageSchema,
  );
  if (
    page.branchId !== branchId ||
    (query.on !== undefined && page.on !== query.on) ||
    page.data.length > query.limit ||
    (query.cursor !== undefined && page.data.some((room) => room.id <= (query.cursor ?? '')))
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return page;
}
// BED-002: one bed's authoritative state and covering claims.
export async function readBedOccupancy(
  client: ApiClient,
  branch: unknown,
  bed: unknown,
  inputQuery: unknown = {},
) {
  const branchId = stayIdentifierSchema.parse(branch),
    bedId = stayIdentifierSchema.parse(bed),
    query = bedOccupancyQuerySchema.parse(inputQuery);
  const detail = await readApi(
    client.GET('/v1/branches/{branchId}/occupancy/beds/{bedId}', {
      params: { path: { branchId, bedId }, query: query.on === undefined ? {} : { on: query.on } },
    }),
    bedOccupancySchema,
  );
  if (
    detail.branchId !== branchId ||
    detail.bed.id !== bedId ||
    (query.on !== undefined && detail.on !== query.on)
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return detail;
}
