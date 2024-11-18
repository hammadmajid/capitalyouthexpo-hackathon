import {
  dashboardQueueKindSchema,
  dashboardQueuePageSchema,
  managementPageSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
export async function readDashboardQueue(
  client: ApiClient,
  branch: unknown,
  kind: unknown,
  input: unknown = {},
) {
  const branchId = stayIdentifierSchema.parse(branch),
    queue = dashboardQueueKindSchema.parse(kind),
    query = managementPageSchema.parse(input);
  const page = await readApi(
    client.GET('/v1/branches/{branchId}/dashboard/queues/{queue}', {
      params: {
        path: { branchId, queue },
        query: { limit: query.limit, ...(query.cursor ? { cursor: query.cursor } : {}) },
      },
    }),
    dashboardQueuePageSchema,
  );
  if (page.branchId !== branchId || page.queue !== queue || page.data.length > query.limit)
    throw new ClientFailure('INVALID_RESPONSE');
  const ids =
    page.queue === 'overdue'
      ? page.data.map((row) => row.balance.invoiceId)
      : page.data.map((row) => row.id);
  const descending = queue === 'complaints';
  for (const [index, id] of ids.entries()) {
    const previous = index === 0 ? query.cursor : ids[index - 1];
    if (previous && (descending ? id >= previous : id <= previous))
      throw new ClientFailure('INVALID_RESPONSE');
  }
  if (page.nextCursor !== null && (ids.length !== query.limit || page.nextCursor !== ids.at(-1)))
    throw new ClientFailure('INVALID_RESPONSE');
  if (page.queue !== 'overdue' && page.data.some((row) => row.branchId !== branchId))
    throw new ClientFailure('INVALID_RESPONSE');
  return page;
}
