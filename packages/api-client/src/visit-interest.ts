import { z } from 'zod';
import { visitInterestInputSchema, visitInterestStateSchema } from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export async function readVisitInterest(client: ApiClient, visit: string, branch?: string) {
  const visitId = id.parse(visit),
    branchId = branch ? id.parse(branch) : undefined;
  const result = await readApi(
    branchId
      ? client.GET('/v1/branches/{branchId}/visits/{visitId}/interest', {
          params: { path: { branchId, visitId } },
        })
      : client.GET('/v1/me/visits/{visitId}/interest', { params: { path: { visitId } } }),
    visitInterestStateSchema,
  );
  if (result.visitId !== visitId || (branchId && result.branchId !== branchId))
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export async function recordVisitInterest(
  client: ApiClient,
  visit: string,
  input: unknown,
  key: string,
) {
  const visitId = id.parse(visit),
    body = visitInterestInputSchema.parse(input),
    commandKey = id.parse(key);
  const result = await readApi(
    client.POST('/v1/me/visits/{visitId}/interest', {
      params: { path: { visitId }, header: { 'Idempotency-Key': commandKey } },
      body,
    }),
    visitInterestStateSchema,
  );
  if (
    result.visitId !== visitId ||
    result.stillInterested !== body.stillInterested ||
    !result.respondedAt ||
    Date.parse(result.expectedUpdatedAt) <= Date.parse(body.expectedUpdatedAt)
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
