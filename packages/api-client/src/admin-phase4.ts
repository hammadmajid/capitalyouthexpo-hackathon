import {
  adminAnnouncementPageSchema,
  adminAnnouncementQuerySchema,
  adminInstitutionPageSchema,
  adminInstitutionQuerySchema,
  adminInstitutionSchema,
  institutionGovernanceInputSchema,
  institutionHistoryQuerySchema,
  institutionHistoryPageSchema,
  institutionUpdateInputSchema,
  institutionStateSchema,
  stayIdentifierSchema as id,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
function defined<T extends object>(input: T) {
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
}
export function readAdminAnnouncements(client: ApiClient, query: unknown = {}) {
  return readApi(
    client.GET('/v1/admin/announcement-history', {
      params: { query: defined(adminAnnouncementQuerySchema.parse(query)) },
    }),
    adminAnnouncementPageSchema,
  );
}
export function listAdminInstitutions(client: ApiClient, query: unknown = {}) {
  return readApi(
    client.GET('/v1/admin/institutions', {
      params: { query: defined(adminInstitutionQuerySchema.parse(query)) },
    }),
    adminInstitutionPageSchema,
  );
}
export async function readAdminInstitution(client: ApiClient, placeId: unknown) {
  const target = id.parse(placeId);
  const result = await readApi(
    client.GET('/v1/admin/institutions/{placeId}', { params: { path: { placeId: target } } }),
    adminInstitutionSchema,
  );
  if (result.id !== target) throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export async function saveAdminInstitution(
  client: ApiClient,
  input: unknown,
  key: string,
  placeId?: string,
) {
  const header = { 'Idempotency-Key': id.parse(key) };
  const target = placeId === undefined ? undefined : id.parse(placeId);
  const result = await readApi(
    target
      ? client.PUT('/v1/admin/institutions/{placeId}', {
          params: { path: { placeId: target }, header },
          body: institutionUpdateInputSchema.parse(input),
        })
      : client.POST('/v1/admin/institutions', {
          params: { header },
          body: institutionGovernanceInputSchema.parse(input),
        }),
    institutionStateSchema,
  );
  if (target && result.id !== target) throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export function readAdminInstitutionHistory(
  client: ApiClient,
  placeId: unknown,
  query: unknown = {},
) {
  return readApi(
    client.GET('/v1/admin/institutions/{placeId}/history', {
      params: {
        path: { placeId: id.parse(placeId) },
        query: defined(institutionHistoryQuerySchema.parse(query)),
      },
    }),
    institutionHistoryPageSchema,
  );
}
