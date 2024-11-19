import { z } from 'zod';
import {
  residentAccountLinkDecisionSchema,
  residentAccountLinkPageSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { readApi } from './result.js';

export function readResidentAccountLinks(client: ApiClient, branch: unknown, cursor?: string) {
  const branchId = stayIdentifierSchema.parse(branch);
  const query = z.object({ cursor: z.string().uuid().optional() }).parse({ cursor });
  return readApi(
    client.GET('/v1/branches/{branchId}/residents/account-link-requests', {
      params: {
        path: { branchId },
        query: query.cursor === undefined ? {} : { cursor: query.cursor },
      },
    }),
    residentAccountLinkPageSchema,
  );
}
export function decideResidentAccountLink(
  client: ApiClient,
  branch: unknown,
  request: unknown,
  input: unknown,
) {
  const branchId = stayIdentifierSchema.parse(branch),
    requestId = stayIdentifierSchema.parse(request);
  return readApi(
    client.PUT('/v1/branches/{branchId}/residents/account-link-requests/{requestId}', {
      params: { path: { branchId, requestId } },
      body: residentAccountLinkDecisionSchema.parse(input),
    }),
    z.object({ success: z.literal(true) }).strict(),
  );
}
export function readOwnResidentLinkStatus(client: ApiClient) {
  return readApi(
    client.GET('/v1/me/resident-link-status'),
    z.object({ pending: z.boolean() }).strict(),
  );
}
