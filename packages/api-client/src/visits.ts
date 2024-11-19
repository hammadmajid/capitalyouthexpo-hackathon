import { z } from 'zod';
import {
  createVisitInputSchema,
  saveVisitingHoursSchema,
  visitActionInputSchema,
  visitListQuerySchema,
  visitPageSchema,
  visitSlotsSchema,
  visitSummarySchema,
  visitingHoursStateSchema,
  calendarDateSchema,
  type VisitListQuery,
  type VisitSummary,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
const identifier = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
function invalid(): never {
  throw new ClientFailure('INVALID_RESPONSE');
}
function page(value: z.infer<typeof visitPageSchema>, query: VisitListQuery, branchId?: string) {
  let cursor = query.cursor?.toLowerCase() ?? '';
  for (const row of value.data) {
    if (
      row.id <= cursor ||
      (branchId && row.branchId !== branchId) ||
      (query.status && row.status !== query.status)
    )
      invalid();
    if (
      query.date &&
      new Date(Date.parse(row.requestedStart) + 18000000).toISOString().slice(0, 10) !== query.date
    )
      invalid();
    cursor = row.id;
  }
  if (
    value.data.length > query.limit ||
    (value.nextCursor !== null &&
      (value.data.length !== query.limit || value.nextCursor !== cursor))
  )
    invalid();
  return value;
}
function wireQuery(query: VisitListQuery) {
  return {
    limit: query.limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
    ...(query.date ? { date: query.date } : {}),
    ...(query.status ? { status: query.status } : {}),
  };
}
export async function listOwnVisits(client: ApiClient, input: unknown = {}) {
  const query = visitListQuerySchema.parse(input);
  return page(
    await readApi(
      client.GET('/v1/me/visits', { params: { query: wireQuery(query) } }),
      visitPageSchema,
    ),
    query,
  );
}
export async function listBranchVisits(client: ApiClient, branch: string, input: unknown = {}) {
  const branchId = identifier.parse(branch),
    query = visitListQuerySchema.parse(input);
  return page(
    await readApi(
      client.GET('/v1/branches/{branchId}/visits', {
        params: { path: { branchId }, query: wireQuery(query) },
      }),
      visitPageSchema,
    ),
    query,
    branchId,
  );
}
export async function readVisitSlots(client: ApiClient, slug: string, date: string) {
  const day = calendarDateSchema.parse(date),
    name = z.string().min(1).max(160).parse(slug);
  const result = await readApi(
    client.GET('/v1/public/hostels/{slug}/visit-slots', {
      params: { path: { slug: name }, query: { date: day } },
    }),
    visitSlotsSchema,
  );
  if (
    result.date !== day ||
    result.windows.some((window) => window.dayOfWeek !== new Date(day + 'T00:00:00Z').getUTCDay())
  )
    invalid();
  return result;
}
export async function readVisitingHours(client: ApiClient, branch: string) {
  const branchId = identifier.parse(branch);
  const result = await readApi(
    client.GET('/v1/branches/{branchId}/visiting-hours', { params: { path: { branchId } } }),
    visitingHoursStateSchema,
  );
  if (result.branchId !== branchId) invalid();
  return result;
}
export async function saveVisitingHours(
  client: ApiClient,
  branch: string,
  input: unknown,
  key: string,
) {
  const branchId = identifier.parse(branch),
    body = saveVisitingHoursSchema.parse(input),
    commandKey = identifier.parse(key);
  const result = await readApi(
    client.PUT('/v1/branches/{branchId}/visiting-hours', {
      params: { path: { branchId }, header: { 'Idempotency-Key': commandKey } },
      body,
    }),
    visitingHoursStateSchema,
  );
  const order = (windows: typeof body.windows) =>
    [...windows].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.opensAt.localeCompare(b.opensAt));
  if (
    result.branchId !== branchId ||
    JSON.stringify(order(result.windows)) !== JSON.stringify(order(body.windows))
  )
    invalid();
  return result;
}
export async function requestVisit(client: ApiClient, input: unknown, key: string) {
  const body = createVisitInputSchema.parse(input),
    commandKey = identifier.parse(key);
  const result = await readApi(
    client.POST('/v1/me/visits', { params: { header: { 'Idempotency-Key': commandKey } }, body }),
    visitSummarySchema,
  );
  if (
    result.branchId !== body.branchId ||
    result.status !== 'requested' ||
    Date.parse(result.requestedStart) !== Date.parse(body.requestedStart)
  )
    invalid();
  return result;
}
function expectedStatus(
  action: z.infer<typeof visitActionInputSchema>['command']['action'],
): VisitSummary['status'] {
  switch (action) {
    case 'approve':
    case 'accept-reschedule':
      return 'approved';
    case 'reschedule':
      return 'rescheduled';
    case 'reject':
      return 'rejected';
    case 'cancel':
      return 'cancelled';
    case 'complete':
      return 'completed';
    case 'no-show':
      return 'no_show';
  }
}
export async function actOnVisit(
  client: ApiClient,
  visit: string,
  input: unknown,
  key: string,
  branch?: string,
) {
  const visitId = identifier.parse(visit),
    branchId = branch ? identifier.parse(branch) : undefined,
    body = visitActionInputSchema.parse(input),
    commandKey = identifier.parse(key);
  const command =
    body.command.action === 'reschedule'
      ? {
          action: body.command.action,
          proposedStart: body.command.proposedStart,
          ...(body.command.note === undefined ? {} : { note: body.command.note }),
        }
      : body.command;
  const wire = { expectedUpdatedAt: body.expectedUpdatedAt, command };
  const result = await readApi(
    branchId
      ? client.POST('/v1/branches/{branchId}/visits/{visitId}/actions', {
          params: { path: { branchId, visitId }, header: { 'Idempotency-Key': commandKey } },
          body: wire,
        })
      : client.POST('/v1/me/visits/{visitId}/actions', {
          params: { path: { visitId }, header: { 'Idempotency-Key': commandKey } },
          body: wire,
        }),
    visitSummarySchema,
  );
  if (
    result.id !== visitId ||
    (branchId && result.branchId !== branchId) ||
    result.status !== expectedStatus(command.action)
  )
    invalid();
  if (
    command.action === 'reschedule' &&
    Date.parse(result.proposedStart ?? '') !== Date.parse(command.proposedStart)
  )
    invalid();
  return result;
}
