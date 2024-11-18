import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createApiClient } from './client.js';
import { listNotifications, markNotificationRead } from './inbox.js';
const id = '019a1234-1234-7123-8123-123456789abc';
const key = randomUUID();
function fixture(response: unknown, cookie = false) {
  const requests: Request[] = [];
  const client = createApiClient({
    baseUrl: 'https://example.test',
    authentication: cookie
      ? { kind: 'cookie', csrf: () => 'fixture-csrf' }
      : { kind: 'bearer', accessToken: async () => 'fixture-token' },
    fetch: async (input, init) => {
      requests.push(input instanceof Request ? input : new Request(input, init));
      return Response.json(response);
    },
  });
  function request() {
    const first = requests[0];
    if (!first) throw new Error('Missing request');
    return first;
  }
  return { client, requests, request };
}
it('NTF-002 / SEC-003: own inbox uses authenticated pagination and real unread count', async () => {
  const wire = fixture({ data: [], nextCursor: null, unreadCount: 7 });
  expect((await listNotifications(wire.client, { cursor: id, limit: 10 })).unreadCount).toBe(7);
  expect(wire.request().headers.get('Authorization')).toBe('Bearer fixture-token');
  const url = new URL(wire.request().url);
  expect(url.pathname).toBe('/v1/me/notifications');
  expect(url.searchParams.get('cursor')).toBe(id);
  expect(url.searchParams.get('limit')).toBe('10');
});
it('NTF-002: default empty inbox preserves zero unread count', async () => {
  const wire = fixture({ data: [], nextCursor: null, unreadCount: 0 });
  expect(await listNotifications(wire.client)).toEqual({
    data: [],
    nextCursor: null,
    unreadCount: 0,
  });
  expect(new URL(wire.request().url).searchParams.has('cursor')).toBe(false);
});
it('SEC-003: inbox rejects caller-supplied account scope before network access', () => {
  const wire = fixture({}),
    page = { limit: 10, userId: id };
  expect(() => listNotifications(wire.client, page)).toThrow();
  expect(wire.requests).toHaveLength(0);
});
it('SEC-003: unexpected private server fields never reach inbox UI', async () => {
  const wire = fixture({ data: [], nextCursor: null, unreadCount: 0, userId: id });
  await expect(listNotifications(wire.client)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('NTF-002 / SEC-003: marking read carries exact ID, idempotency and cookie CSRF', async () => {
  const result = { id, readAt: '2026-10-15T10:00:00Z' },
    wire = fixture(result, true);
  expect(await markNotificationRead(wire.client, id, key)).toEqual(result);
  expect(wire.request().method).toBe('PUT');
  expect(new URL(wire.request().url).pathname).toBe(`/v1/me/notifications/${id}/read`);
  expect(wire.request().headers.get('Idempotency-Key')).toBe(key);
  expect(wire.request().headers.get('X-CSRF-Token')).toBe('fixture-csrf');
  expect(wire.request().credentials).toBe('include');
});
it('SEC-003: invalid read identifiers and keys cannot reach network', () => {
  const wire = fixture({});
  expect(() => markNotificationRead(wire.client, 'invalid', key)).toThrow();
  expect(() => markNotificationRead(wire.client, id, 'invalid')).toThrow();
  expect(wire.requests).toHaveLength(0);
});
