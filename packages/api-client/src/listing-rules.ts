import { z } from 'zod';
import {
  decodeListingRuleCursor,
  listingRuleSequenceIsValid,
  listingRulesQuerySchema,
  listingRuleInputSchema,
  listingRuleArchiveSchema,
  listingVersionSchema,
  privateListingRuleStateSchema,
  privateListingRulesPageSchema,
  publicListingRulesQuerySchema,
  publicListingRulesPageSchema,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
function invalid() {
  throw new ClientFailure('INVALID_RESPONSE');
}
function scope<T extends { branchId: string }>(value: T, branch: string) {
  if (value.branchId !== branch) invalid();
  return value;
}
function page<
  T extends {
    branchId: string;
    data: { id: string; sortOrder: number }[];
    nextCursor: string | null;
  },
>(value: T, branch: string, query: { limit: number; cursor?: string }) {
  scope(value, branch);
  if (
    value.data.length > query.limit ||
    (value.nextCursor !== null && value.data.length !== query.limit) ||
    !listingRuleSequenceIsValid(
      value.data,
      query.cursor ? decodeListingRuleCursor(query.cursor) : undefined,
    )
  )
    invalid();
  return value;
}
export async function listPublicListingRules(
  client: ApiClient,
  branchId: string,
  input: unknown = {},
) {
  const branch = id.parse(branchId),
    parsed = publicListingRulesQuerySchema.parse(input),
    query = { limit: parsed.limit, ...(parsed.cursor ? { cursor: parsed.cursor } : {}) };
  return page(
    await readApi(
      client.GET('/v1/marketplace/{branchId}/rules', {
        params: { path: { branchId: branch }, query },
      }),
      publicListingRulesPageSchema,
    ),
    branch,
    query,
  );
}
export async function listListingRules(client: ApiClient, branchId: string, input: unknown = {}) {
  const branch = id.parse(branchId),
    parsed = listingRulesQuerySchema.parse(input),
    query = {
      limit: parsed.limit,
      state: parsed.state,
      ...(parsed.cursor ? { cursor: parsed.cursor } : {}),
    };
  const result = page(
    await readApi(
      client.GET('/v1/branches/{branchId}/rules', {
        params: { path: { branchId: branch }, query },
      }),
      privateListingRulesPageSchema,
    ),
    branch,
    query,
  );
  if (result.state !== query.state) invalid();
  return result;
}
export async function readListingRule(client: ApiClient, branchId: string, ruleId: string) {
  const branch = id.parse(branchId),
    rule = id.parse(ruleId);
  const result = scope(
    await readApi(
      client.GET('/v1/branches/{branchId}/rules/{ruleId}', {
        params: { path: { branchId: branch, ruleId: rule } },
      }),
      privateListingRuleStateSchema,
    ),
    branch,
  );
  if (result.id !== rule) invalid();
  return result;
}
export async function createListingRule(
  client: ApiClient,
  branchId: string,
  input: unknown,
  key: string,
) {
  const branch = id.parse(branchId),
    body = listingRuleInputSchema.parse(input),
    commandKey = id.parse(key);
  const result = scope(
    await readApi(
      client.POST('/v1/branches/{branchId}/rules', {
        params: { path: { branchId: branch }, header: { 'Idempotency-Key': commandKey } },
        body,
      }),
      privateListingRuleStateSchema,
    ),
    branch,
  );
  if (
    !result.canEdit ||
    result.archivedAt !== null ||
    result.body !== body.body ||
    result.sortOrder !== body.sortOrder
  )
    invalid();
  return result;
}
export async function editListingRule(
  client: ApiClient,
  branchId: string,
  ruleId: string,
  version: string,
  input: unknown,
  key: string,
) {
  const branch = id.parse(branchId),
    rule = id.parse(ruleId),
    expected = listingVersionSchema.parse(version),
    body = listingRuleInputSchema.parse(input),
    commandKey = id.parse(key);
  const result = scope(
    await readApi(
      client.PUT('/v1/branches/{branchId}/rules/{ruleId}', {
        params: {
          path: { branchId: branch, ruleId: rule },
          header: { 'If-Match': '"' + expected + '"', 'Idempotency-Key': commandKey },
        },
        body,
      }),
      privateListingRuleStateSchema,
    ),
    branch,
  );
  if (
    result.id !== rule ||
    !result.canEdit ||
    result.archivedAt !== null ||
    result.body !== body.body ||
    result.sortOrder !== body.sortOrder
  )
    invalid();
  return result;
}
export async function archiveListingRule(
  client: ApiClient,
  branchId: string,
  ruleId: string,
  version: string,
  input: unknown,
  key: string,
) {
  const branch = id.parse(branchId),
    rule = id.parse(ruleId),
    expected = listingVersionSchema.parse(version),
    body = listingRuleArchiveSchema.parse(input),
    commandKey = id.parse(key);
  const result = scope(
    await readApi(
      client.POST('/v1/branches/{branchId}/rules/{ruleId}/archive', {
        params: {
          path: { branchId: branch, ruleId: rule },
          header: { 'If-Match': '"' + expected + '"', 'Idempotency-Key': commandKey },
        },
        body,
      }),
      privateListingRuleStateSchema,
    ),
    branch,
  );
  if (result.id !== rule || !result.canEdit || result.archivedAt === null) invalid();
  return result;
}
