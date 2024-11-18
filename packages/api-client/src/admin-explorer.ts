import {
  adminExplorerDetailSchema,
  adminExplorerKindSchema,
  adminExplorerPageSchema,
  adminExplorerQuerySchema,
  adminExplorerSummarySchema,
  stayIdentifierSchema,
  type AdminExplorerKind,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
export function readAdminExplorerSummary(client: ApiClient) {
  return readApi(client.GET('/v1/admin/explorer/summary'), adminExplorerSummarySchema);
}
export async function listAdminExplorer(
  client: ApiClient,
  target: AdminExplorerKind,
  input: unknown = {},
) {
  const kind = adminExplorerKindSchema.parse(target),
    parsed = adminExplorerQuerySchema.parse(input);
  const query = Object.fromEntries(
    Object.entries(parsed).filter(([, value]) => value !== undefined),
  );
  const result = await readApi(
    client.GET('/v1/admin/explorer/{kind}', { params: { path: { kind }, query } }),
    adminExplorerPageSchema,
  );
  if (result.kind !== kind) throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export async function readAdminExplorerDetail(
  client: ApiClient,
  target: AdminExplorerKind,
  identifier: unknown,
) {
  const kind = adminExplorerKindSchema.parse(target),
    id = stayIdentifierSchema.parse(identifier);
  const result = await readApi(
    client.GET('/v1/admin/explorer/{kind}/{id}', { params: { path: { kind, id } } }),
    adminExplorerDetailSchema,
  );
  if (result.kind !== kind || result.record.id !== id) throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
