import { z } from 'zod';
import { managementPageSchema, visitHistoryPageSchema } from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export async function readVisitHistory(
  client: ApiClient,
  visit: string,
  input: unknown = {},
  branch?: string,
) {
  const visitId = id.parse(visit),
    branchId = branch ? id.parse(branch) : undefined;
  const paging = managementPageSchema.parse(input);
  const query = { limit: paging.limit, ...(paging.cursor ? { cursor: paging.cursor } : {}) };
  const result = await readApi(
    branchId
      ? client.GET('/v1/branches/{branchId}/visits/{visitId}/history', {
          params: { path: { branchId, visitId }, query },
        })
      : client.GET('/v1/me/visits/{visitId}/history', { params: { path: { visitId }, query } }),
    visitHistoryPageSchema,
  );
  let cursor = paging.cursor ?? '';
  if (
    result.visitId !== visitId ||
    (branchId && result.branchId !== branchId) ||
    result.data.length > paging.limit
  )
    throw new ClientFailure('INVALID_RESPONSE');
  for (const entry of result.data) {
    if (entry.id <= cursor) throw new ClientFailure('INVALID_RESPONSE');
    cursor = entry.id;
  }
  if (
    result.nextCursor !== null &&
    (result.data.length !== paging.limit || result.nextCursor !== cursor)
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
