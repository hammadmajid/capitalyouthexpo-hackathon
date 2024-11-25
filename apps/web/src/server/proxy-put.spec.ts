// @vitest-environment node
import { expect, it, vi } from 'vitest';
import * as route from '../app/api/v1/[...path]/route';
import { proxyApi } from './proxy';
import { webConfig } from './config';
const config = webConfig({ APP_ENV: 'test' });
const id = '019a1234-1234-7123-8123-123456789abc';
it('NTF-002 / SEC-001: browser API route registers PUT for persisted read/favorite actions', () => {
  expect(Reflect.get(route, 'PUT')).toBeTypeOf('function');
});
it('SEC-001 / NTF-002: PUT preserves cookie, CSRF and idempotency through bounded proxy', async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ id, readAt: '2026-10-15T10:00:00Z' }));
  const response = await proxyApi(
    new Request('http://localhost:3000/api/v1/me/notifications/' + id + '/read', {
      method: 'PUT',
      headers: {
        origin: config.WEB_ORIGIN,
        cookie: 'hsm_access=fixture',
        'x-csrf-token': 'fixture-csrf',
        'idempotency-key': id,
      },
    }),
    ['me', 'notifications', id, 'read'],
    config,
    transport,
  );
  expect(response.status).toBe(200);
  const [url, init] = transport.mock.calls[0] ?? [];
  expect(String(url)).toBe('http://127.0.0.1:4000/v1/me/notifications/' + id + '/read');
  expect(init?.method).toBe('PUT');
  const headers = new Headers(init?.headers);
  expect(headers.get('cookie')).toBe('hsm_access=fixture');
  expect(headers.get('x-csrf-token')).toBe('fixture-csrf');
  expect(headers.get('idempotency-key')).toBe(id);
  expect(response.headers.get('cache-control')).toBe('no-store');
});
it.each([undefined, 'https://attacker.example'])(
  'SEC-001: PUT cannot bypass exact-origin protection (%s)',
  async (origin) => {
    const transport = vi.fn<typeof fetch>();
    const response = await proxyApi(
      new Request('http://localhost:3000/api/v1/me/notifications/' + id + '/read', {
        method: 'PUT',
        headers: origin ? { origin } : {},
      }),
      ['me', 'notifications', id, 'read'],
      config,
      transport,
    );
    expect(response.status).toBe(403);
    expect(transport).not.toHaveBeenCalled();
  },
);
