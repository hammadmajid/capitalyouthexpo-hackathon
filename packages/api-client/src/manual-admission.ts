import { manualAdmissionWire } from './manual-admission-wire.js';
import {
  manualAdmissionCommandSchema,
  manualAdmissionResultSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
// STAY-001 / ACC-004: callers retain one key for retries of one unchanged intent.
export async function createManualStay(
  client: ApiClient,
  branch: unknown,
  body: unknown,
  key: string,
) {
  const branchId = stayIdentifierSchema.parse(branch),
    input = manualAdmissionCommandSchema.parse(body),
    header = { 'Idempotency-Key': stayIdentifierSchema.parse(key) };
  const result = await readApi(
    client.POST('/v1/branches/{branchId}/stays/manual', {
      params: { path: { branchId }, header },
      body: manualAdmissionWire(input),
    }),
    manualAdmissionResultSchema,
  );
  if (
    result.branchId !== branchId ||
    (input.manual.resident.kind === 'existing' &&
      result.residentId !== input.manual.resident.residentId)
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
