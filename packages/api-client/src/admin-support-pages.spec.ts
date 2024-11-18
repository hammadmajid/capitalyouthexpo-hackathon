import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import {
  readAdminSupportMessages,
  readAdminSupportQueue,
  readOwnSupportMessages,
} from './admin-support-pages.js';
const ticketId = '10000000-0000-4000-8000-000000000001';
const cursor = '10000000-0000-4000-8000-000000000002';
function wire(body: unknown) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(body));
  return {
    fetch,
    client: createApiClient({
      baseUrl: 'https://api.example.test',
      authentication: { kind: 'bearer', accessToken: async () => 'fixture' },
      fetch,
    }),
  };
}
it('ADM-009: staff filters and thread cursor reach exact authenticated SDK routes', async () => {
  const queue = wire({ data: [], nextCursor: null });
  await readAdminSupportQueue(queue.client, {
    priority: 'high',
    q: 'Access',
    status: 'open',
    limit: 2,
  });
  const request = queue.fetch.mock.calls[0]?.[0] as Request;
  expect(new URL(request.url).searchParams.get('priority')).toBe('high');
  expect(new URL(request.url).searchParams.get('q')).toBe('Access');
  expect(request.headers.get('Authorization')).toBe('Bearer fixture');
  const messages = wire({ ticketId, data: [], nextCursor: cursor });
  expect(
    (await readAdminSupportMessages(messages.client, ticketId, { cursor, limit: 1 })).nextCursor,
  ).toBe(cursor);
  const url = new URL((messages.fetch.mock.calls[0]?.[0] as Request).url);
  expect(url.pathname).toBe('/v1/admin/support-tickets/' + ticketId + '/messages');
  expect(url.searchParams.get('cursor')).toBe(cursor);
});
it('SEC-003: participant SDK rejects wrong-ticket responses and any internal notes', async () => {
  const wrong = wire({ ticketId: cursor, data: [], nextCursor: null });
  await expect(readOwnSupportMessages(wrong.client, ticketId)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
  const secret = wire({
    ticketId,
    nextCursor: null,
    data: [
      {
        id: cursor,
        authorName: 'Staff',
        fromSupport: true,
        internal: true,
        body: 'private',
        createdAt: '2026-10-30T10:00:00.000Z',
      },
    ],
  });
  await expect(readOwnSupportMessages(secret.client, ticketId)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});
it('ADM-009: invalid staff filters/continuation fail before transport', async () => {
  const value = wire({});
  expect(() => readAdminSupportQueue(value.client, { q: '' })).toThrow();
  await expect(readAdminSupportMessages(value.client, ticketId, { limit: 101 })).rejects.toThrow();
  expect(value.fetch).not.toHaveBeenCalled();
});
