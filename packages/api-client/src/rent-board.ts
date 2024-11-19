import { rentBoardPageSchema, rentBoardQuerySchema, stayIdentifierSchema } from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
// RB-001..004: management-only billing-month board; rows must stay in the requested scope.
export async function readRentBoard(client: ApiClient, branch: unknown, inputQuery: unknown = {}) {
  const branchId = stayIdentifierSchema.parse(branch),
    query = rentBoardQuerySchema.parse(inputQuery);
  const page = await readApi(
    client.GET('/v1/branches/{branchId}/rent-board', {
      params: {
        path: { branchId },
        query: {
          limit: query.limit,
          ...(query.month === undefined ? {} : { month: query.month }),
          ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
        },
      },
    }),
    rentBoardPageSchema,
  );
  if (
    page.branchId !== branchId ||
    (query.month !== undefined && page.month !== query.month) ||
    page.data.length > query.limit ||
    new Set(page.data.map((row) => row.stayId)).size !== page.data.length
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return page;
}
