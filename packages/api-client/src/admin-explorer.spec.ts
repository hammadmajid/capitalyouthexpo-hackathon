import { expect, it } from 'vitest';
import { createApiClient } from './client.js';
import { listAdminExplorer, readAdminExplorerDetail } from './admin-explorer.js';
const id = '10000000-0000-4000-8000-000000000001';
const row = {
  id,
  name: 'Fixture',
  status: 'active',
  createdAt: '2026-10-31T00:00:00Z',
  parentId: null,
  parentName: null,
  quantity: null,
  amountPaisa: null,
  reason: null,
};
it('HMA-017: explorer SDK sends validated filters/cursors and binds response kind', async () => {
  const urls: URL[] = [];
  const client = createApiClient({
    baseUrl: 'http://localhost',
    authentication: { kind: 'bearer', accessToken: async () => undefined },
    fetch: async (input) => {
      urls.push(new URL(input instanceof Request ? input.url : String(input)));
      return Response.json({
        kind: 'users',
        generatedAt: '2026-10-31T00:00:00Z',
        timezone: 'Asia/Karachi',
        data: [row],
        nextCursor: null,
        totalCount: 1,
        statistics: { month: 1, quarter: 1, year: 1, lifetime: 1 },
        statisticsLabel: 'Created',
        statuses: ['active'],
        quantity: null,
        amountPaisa: null,
        notice: 'Metadata only',
      });
    },
  });
  await listAdminExplorer(client, 'users', {
    q: 'Fixture',
    period: 'quarter',
    sort: 'name_asc',
    limit: 1,
  });
  expect(urls[0]?.pathname).toBe('/v1/admin/explorer/users');
  expect(urls[0]?.searchParams.get('period')).toBe('quarter');
  expect(urls[0]?.searchParams.has('cursor')).toBe(false);
  await expect(listAdminExplorer(client, 'owners')).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
  await expect(listAdminExplorer(client, 'users', { limit: 500 })).rejects.toBeDefined();
  expect(urls).toHaveLength(2);
});
it('HMA-017 SEC-003: explorer detail rejects mismatched targets and unexpected private fields', async () => {
  let body: unknown = {
    kind: 'users',
    record: { ...row, id: '10000000-0000-4000-8000-000000000002' },
    facts: [],
    links: [],
    action: 'none',
    notice: 'Metadata only',
  };
  const client = createApiClient({
    baseUrl: 'http://localhost',
    authentication: { kind: 'cookie', csrf: () => undefined },
    fetch: async () => Response.json(body),
  });
  await expect(readAdminExplorerDetail(client, 'users', id)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
  body = {
    kind: 'users',
    record: { ...row, email: 'private@example.test' },
    facts: [],
    links: [],
    action: 'none',
    notice: 'Metadata only',
  };
  await expect(readAdminExplorerDetail(client, 'users', id)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});
