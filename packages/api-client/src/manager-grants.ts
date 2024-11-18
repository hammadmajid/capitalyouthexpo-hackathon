import { z } from 'zod';
import {
  managerInventoryGrantInputSchema,
  managerInventoryGrantStateSchema,
  inventoryMutationSchema,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const endpoint = '/v1/branches/{branchId}/managers/{assignmentId}/inventory-permissions';
export async function readManagerInventoryGrants(
  client: ApiClient,
  branchId: string,
  assignmentId: string,
) {
  const branch = id.parse(branchId),
    assignment = id.parse(assignmentId);
  const result = await readApi(
    client.GET(endpoint, {
      params: { path: { branchId: branch, assignmentId: assignment } },
    }),
    managerInventoryGrantStateSchema,
  );
  if (result.branchId !== branch || result.assignmentId !== assignment)
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export async function saveManagerInventoryGrants(
  client: ApiClient,
  branchId: string,
  assignmentId: string,
  input: unknown,
  key: string,
) {
  const branch = id.parse(branchId),
    assignment = id.parse(assignmentId),
    body = managerInventoryGrantInputSchema.parse(input),
    commandKey = id.parse(key);
  const result = await readApi(
    client.PUT(endpoint, {
      params: {
        path: { branchId: branch, assignmentId: assignment },
        header: { 'Idempotency-Key': commandKey },
      },
      body,
    }),
    inventoryMutationSchema,
  );
  if (result.branchId !== branch || result.id !== assignment || result.kind !== 'manager_grants')
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
