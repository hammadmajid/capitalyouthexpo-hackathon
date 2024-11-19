import { z } from 'zod';
import {
  DomainError,
  parseReportFilters,
  reportQuerySchema,
  reportOptionQuerySchema,
  reportOptionPageSchema,
  reportFilterPolicy,
  inventoryPageSequenceIsValid,
  reportSchema,
  reportTypeSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
export type ReportClientQuery = Omit<z.input<typeof reportQuerySchema>, 'format'> & {
  branchId?: string;
};
const clientScope = z.object({ branchId: stayIdentifierSchema.optional() }).passthrough();
function defined<T extends object>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
}
function validated(type: unknown, query: ReportClientQuery) {
  const kind = reportTypeSchema.parse(type);
  const { branchId, ...values } = clientScope.parse(query);
  const { format, ...input } = reportQuerySchema.parse(values);
  parseReportFilters(kind, {
    buildingId: input.buildingId,
    floorId: input.floorId,
    roomId: input.roomId,
    residentId: input.residentId,
    status: input.status,
  });
  if (
    format !== 'json' ||
    input.branchIds?.length === 0 ||
    (branchId !== undefined && input.branchIds?.some((id) => id !== branchId))
  )
    throw new DomainError('VALIDATION_FAILED', 400, 'Invalid report scope');
  return { kind, branchId, input: defined(input) };
}
// RPT-001 / AUD-010: validate one shared selection for every output format. No
// caller-supplied filter is discarded while constructing a request or download.
export function readReport(client: ApiClient, type: unknown, query: ReportClientQuery = {}) {
  const { kind, branchId, input } = validated(type, query);
  const schema = reportSchema.refine((report) => report.type === kind, 'Unexpected report type');
  return branchId === undefined
    ? readApi(
        client.GET('/v1/owner/reports/{type}', { params: { path: { type: kind }, query: input } }),
        schema,
      )
    : readApi(
        client.GET('/v1/branches/{branchId}/reports/{type}', {
          params: { path: { branchId, type: kind }, query: input },
        }),
        schema,
      );
}
export function reportDownloadPath(
  type: unknown,
  format: 'csv' | 'pdf',
  query: ReportClientQuery = {},
) {
  const { kind, branchId, input } = validated(type, query);
  const params = new URLSearchParams({ format });
  for (const [name, value] of Object.entries(input)) {
    if (Array.isArray(value)) for (const id of value) params.append(name, id);
    else if (value !== undefined) params.set(name, value);
  }
  return (
    (branchId === undefined
      ? `/v1/owner/reports/${kind}`
      : `/v1/branches/${branchId}/reports/${kind}`) +
    '?' +
    params.toString()
  );
}
// SEC-003 / AUD-010: never accept names from a different branch, report, parent
// or stale cursor, even when the HTTP response otherwise matches the DTO shape.
export async function readReportFilterOptions(
  client: ApiClient,
  branch: unknown,
  type: unknown,
  query: unknown,
) {
  const branchId = stayIdentifierSchema.parse(branch),
    kind = reportTypeSchema.parse(type),
    input = reportOptionQuerySchema.parse(query);
  if (input.field === 'resident' && !reportFilterPolicy[kind].resident)
    throw new DomainError('VALIDATION_FAILED', 400, 'Resident filter is not applicable');
  const page = await readApi(
    client.GET('/v1/branches/{branchId}/reports/{type}/options', {
      params: { path: { branchId, type: kind }, query: defined(input) },
    }),
    reportOptionPageSchema,
  );
  if (
    page.branchId !== branchId ||
    page.type !== kind ||
    page.field !== input.field ||
    page.buildingId !== (input.buildingId ?? null) ||
    page.floorId !== (input.floorId ?? null) ||
    page.data.length > input.limit ||
    !inventoryPageSequenceIsValid(page.data, input.cursor) ||
    (page.nextCursor !== null &&
      (page.data.length !== input.limit || page.nextCursor !== page.data.at(-1)?.id))
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return page;
}
