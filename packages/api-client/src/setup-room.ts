import {
  inventoryMutationSchema,
  setupRoomInputSchema,
  stayIdentifierSchema as id,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
export async function createSetupRoom(
  client: ApiClient,
  branch: string,
  input: unknown,
  key: string,
) {
  const branchId = id.parse(branch),
    body = setupRoomInputSchema.parse(input);
  const result = await readApi(
    client.POST('/v1/branches/{branchId}/inventory/setup-rooms', {
      params: { path: { branchId }, header: { 'Idempotency-Key': id.parse(key) } },
      body,
    }),
    inventoryMutationSchema,
  );
  if (result.branchId !== branchId || result.kind !== 'room')
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
