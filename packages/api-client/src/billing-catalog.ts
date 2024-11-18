import { z } from 'zod';
import {
  billingCatalogInputSchema,
  billingCatalogArchiveSchema,
  billingCatalogEntrySchema,
  billingCatalogQuerySchema,
  billingCatalogPageSchema,
  inventoryPageSequenceIsValid,
  stayIdentifierSchema,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
const targetSchema = z
  .object({ branchId: stayIdentifierSchema, catalogId: stayIdentifierSchema })
  .strict();
export async function readBillingCatalog(client: ApiClient, branch: unknown, query: unknown = {}) {
  const branchId = stayIdentifierSchema.parse(branch),
    input = billingCatalogQuerySchema.parse(query);
  const wireQuery = {
    limit: input.limit,
    ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
    ...(input.includeArchived === undefined ? {} : { includeArchived: input.includeArchived }),
  };
  const result = await readApi(
    client.GET('/v1/branches/{branchId}/charge-catalog', {
      params: { path: { branchId }, query: wireQuery },
    }),
    billingCatalogPageSchema,
  );
  if (
    result.branchId !== branchId ||
    result.includeArchived !== (input.includeArchived === 'true') ||
    result.data.length > input.limit ||
    !inventoryPageSequenceIsValid(result.data, input.cursor)
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export async function createBillingCatalogEntry(
  client: ApiClient,
  branch: unknown,
  body: unknown,
  key: string,
) {
  const branchId = stayIdentifierSchema.parse(branch),
    input = billingCatalogInputSchema.parse(body),
    header = { 'Idempotency-Key': stayIdentifierSchema.parse(key) };
  const result = await readApi(
    client.POST('/v1/branches/{branchId}/charge-catalog', {
      params: { path: { branchId }, header },
      body: input,
    }),
    billingCatalogEntrySchema,
  );
  if (
    result.branchId !== branchId ||
    result.code !== input.code ||
    result.name !== input.name ||
    result.unitLabel !== input.unitLabel ||
    result.unitAmountPaisa !== input.unitAmountPaisa ||
    result.archivedAt !== null
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export async function archiveBillingCatalogEntry(
  client: ApiClient,
  target: unknown,
  body: unknown,
  key: string,
) {
  const scope = targetSchema.parse(target),
    input = billingCatalogArchiveSchema.parse(body),
    header = { 'Idempotency-Key': stayIdentifierSchema.parse(key) };
  const result = await readApi(
    client.POST('/v1/branches/{branchId}/charge-catalog/{catalogId}/archive', {
      params: { path: scope, header },
      body: input,
    }),
    billingCatalogEntrySchema,
  );
  if (
    result.branchId !== scope.branchId ||
    result.id !== scope.catalogId ||
    result.archivedAt === null
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
