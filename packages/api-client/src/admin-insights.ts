import {
  platformAnalyticsQuerySchema,
  platformAuditExportQuerySchema,
  platformAuditPageSchema,
  platformAuditQuerySchema,
  platformOverviewSchema,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
import { z } from 'zod';
const defined = <T extends object>(value: T) =>
  Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
export function readPlatformOverview(client: ApiClient, query: unknown) {
  return readApi(
    client.GET('/v1/admin/overview', {
      params: { query: platformAnalyticsQuerySchema.parse(query) },
    }),
    platformOverviewSchema,
  );
}
export function readPlatformAudit(client: ApiClient, query: unknown = {}) {
  return readApi(
    client.GET('/v1/admin/audit-log', {
      params: { query: defined(platformAuditQuerySchema.parse(query)) },
    }),
    platformAuditPageSchema,
  );
}
export async function downloadPlatformAudit(client: ApiClient, query: unknown = {}) {
  const body = await client.GET('/v1/admin/audit-log/export', {
    params: { query: defined(platformAuditExportQuerySchema.parse(query)) },
    parseAs: 'text',
  });
  const value = await readApi(Promise.resolve(body), z.string());
  if (!body.response.headers.get('Content-Type')?.startsWith('text/csv'))
    throw new ClientFailure('INVALID_RESPONSE');
  return { csv: value, truncated: body.response.headers.get('X-HSM-Report-Truncated') === 'true' };
}
