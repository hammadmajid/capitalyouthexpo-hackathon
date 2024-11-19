import { z } from 'zod';
import { expectedVacancySchema, saveExpectedVacancySchema } from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
function verify(
  result: z.infer<typeof expectedVacancySchema>,
  branchId: string,
  roomTypeId: string,
) {
  if (result.branchId !== branchId || result.roomTypeId !== roomTypeId)
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export async function readExpectedVacancy(client: ApiClient, branch: string, roomType: string) {
  const branchId = id.parse(branch),
    roomTypeId = id.parse(roomType);
  return verify(
    await readApi(
      client.GET('/v1/branches/{branchId}/room-types/{roomTypeId}/expected-vacancy', {
        params: { path: { branchId, roomTypeId } },
      }),
      expectedVacancySchema,
    ),
    branchId,
    roomTypeId,
  );
}
export async function saveExpectedVacancy(
  client: ApiClient,
  branch: string,
  roomType: string,
  input: unknown,
  key: string,
) {
  const branchId = id.parse(branch),
    roomTypeId = id.parse(roomType),
    body = saveExpectedVacancySchema.parse(input),
    commandKey = id.parse(key);
  const result = verify(
    await readApi(
      client.PUT('/v1/branches/{branchId}/room-types/{roomTypeId}/expected-vacancy', {
        body,
        params: { path: { branchId, roomTypeId }, header: { 'Idempotency-Key': commandKey } },
      }),
      expectedVacancySchema,
    ),
    branchId,
    roomTypeId,
  );
  if (
    result.expectedVacancyDate !== body.expectedVacancyDate ||
    result.version === null ||
    (body.expectedVersion !== null &&
      Date.parse(result.version) <= Date.parse(body.expectedVersion))
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
