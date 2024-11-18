import {
  bedRentInputSchema,
  bedRentPageSchema,
  bedRentQuerySchema,
  bedRentVersionSchema,
  stayIdentifierSchema as id,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
export async function readBedRent(
  client: ApiClient,
  branch: unknown,
  bed: unknown,
  input: unknown = {},
) {
  const branchId = id.parse(branch),
    bedId = id.parse(bed),
    query = bedRentQuerySchema.parse(input);
  const result = await readApi(
    client.GET('/v1/branches/{branchId}/inventory/beds/{bedId}/prices', {
      params: {
        path: { branchId, bedId },
        query: { limit: query.limit, ...(query.cursor ? { cursor: query.cursor } : {}) },
      },
    }),
    bedRentPageSchema,
  );
  if (
    result.branchId !== branchId ||
    result.bedId !== bedId ||
    result.data.some(
      (row) => row.branchId !== branchId || row.bedId !== bedId || row.roomId !== result.roomId,
    )
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export async function scheduleBedRent(
  client: ApiClient,
  branch: unknown,
  bed: unknown,
  input: unknown,
  key: string,
) {
  const branchId = id.parse(branch),
    bedId = id.parse(bed),
    body = bedRentInputSchema.parse(input);
  const result = await readApi(
    client.POST('/v1/branches/{branchId}/inventory/beds/{bedId}/prices', {
      params: { path: { branchId, bedId }, header: { 'Idempotency-Key': id.parse(key) } },
      body: {
        effectiveFrom: body.effectiveFrom,
        monthlyRentPaisa: body.monthlyRentPaisa,
        ...(body.depositPaisa === undefined ? {} : { depositPaisa: body.depositPaisa }),
      },
    }),
    bedRentVersionSchema,
  );
  if (
    result.branchId !== branchId ||
    result.bedId !== bedId ||
    result.monthlyRentPaisa !== body.monthlyRentPaisa ||
    (body.depositPaisa !== undefined && result.depositPaisa !== body.depositPaisa) ||
    result.effectiveFrom !== body.effectiveFrom
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
