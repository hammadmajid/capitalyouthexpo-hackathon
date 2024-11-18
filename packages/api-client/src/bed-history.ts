import {
  bedHistoryQuerySchema,
  bedOccupancyHistoryPageSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
// BED-002: reject foreign scope or broken chronological continuation before rendering.
export async function readBedHistory(
  client: ApiClient,
  branch: unknown,
  bed: unknown,
  input: unknown = {},
) {
  const branchId = stayIdentifierSchema.parse(branch),
    bedId = stayIdentifierSchema.parse(bed);
  const query = bedHistoryQuerySchema.parse(input);
  const page = await readApi(
    client.GET('/v1/branches/{branchId}/occupancy/beds/{bedId}/history', {
      params: {
        path: { branchId, bedId },
        query: {
          limit: query.limit,
          ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
        },
      },
    }),
    bedOccupancyHistoryPageSchema,
  );
  const keys = page.data.map((row) => row.startedAt + '|' + row.assignmentId);
  if (
    page.branchId !== branchId ||
    page.bedId !== bedId ||
    page.data.length > query.limit ||
    keys.some(
      (key, index) =>
        (index > 0 && key >= (keys[index - 1] ?? '')) ||
        (query.cursor !== undefined && key >= query.cursor),
    ) ||
    (page.nextCursor !== null &&
      (page.data.length !== query.limit || page.nextCursor !== keys.at(-1)))
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return page;
}
