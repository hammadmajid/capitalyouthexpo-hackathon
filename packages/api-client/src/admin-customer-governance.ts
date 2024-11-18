import {
  customerGovernanceInputSchema,
  customerGovernancePageSchema,
  customerGovernanceQuerySchema,
  customerGovernanceRecordSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
export function listGovernedCustomers(client: ApiClient, query: unknown = {}) {
  const { cursor, limit, status, userId } = customerGovernanceQuerySchema.parse(query);
  return readApi(
    client.GET('/v1/admin/customers', {
      params: {
        query: { limit, status, ...(userId ? { userId } : {}), ...(cursor ? { cursor } : {}) },
      },
    }),
    customerGovernancePageSchema,
  );
}
export async function decideCustomer(
  client: ApiClient,
  target: unknown,
  input: unknown,
  key: unknown,
) {
  const userId = stayIdentifierSchema.parse(target);
  const result = await readApi(
    client.POST('/v1/admin/customers/{userId}/decisions', {
      params: { path: { userId }, header: { 'Idempotency-Key': stayIdentifierSchema.parse(key) } },
      body: customerGovernanceInputSchema.parse(input),
    }),
    customerGovernanceRecordSchema,
  );
  if (result.userId !== userId) throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
