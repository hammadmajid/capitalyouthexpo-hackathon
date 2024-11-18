import { expect, it } from 'vitest';
import { createApiClient } from './client.js';
import { readDashboardQueue } from './dashboard-queues.js';
const branchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function wire(body: unknown) {
  const requests: Request[] = [];
  const client = createApiClient({
    baseUrl: 'https://example.test',
    authentication: { kind: 'bearer', accessToken: async () => 'fixture-token' },
    fetch: async (input, init) => {
      requests.push(input instanceof Request ? input : new Request(input, init));
      return Response.json(body);
    },
  });
  return { client, requests };
}
it.each(['overdue', 'complaints', 'checkouts'] as const)(
  'AUD-009 / ACC-002: %s retains exact branch and validated cursor',
  async (queue) => {
    const f = wire({ queue, branchId, asOf: '2026-10-28', data: [], nextCursor: null });
    expect(
      await readDashboardQueue(f.client, branchId, queue, { limit: 1, cursor: id }),
    ).toMatchObject({ queue, data: [] });
    const url = new URL(f.requests[0]?.url ?? '');
    expect(url.pathname).toBe(`/v1/branches/${branchId}/dashboard/queues/${queue}`);
    expect(url.searchParams.get('limit')).toBe('1');
    expect(url.searchParams.get('cursor')).toBe(id);
  },
);
it.each([{ branchId: id }, { queue: 'checkouts' }, { nextCursor: id }, { asOf: 'not-a-date' }])(
  'AUD-009 / SEC-003: contradictory queue response fails closed: %j',
  async (bad) => {
    const f = wire({
      queue: 'overdue',
      branchId,
      asOf: '2026-10-28',
      data: [],
      nextCursor: null,
      ...bad,
    });
    await expect(readDashboardQueue(f.client, branchId, 'overdue')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  },
);
it('AUD-009: unsupported input never sends a request', async () => {
  const f = wire({});
  await expect(readDashboardQueue(f.client, branchId, 'all')).rejects.toThrow();
  await expect(readDashboardQueue(f.client, 'foreign', 'overdue')).rejects.toThrow();
  expect(f.requests).toHaveLength(0);
});
