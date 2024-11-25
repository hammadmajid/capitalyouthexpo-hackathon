// @vitest-environment node
import { expect, it, vi } from 'vitest';
import * as route from '../app/api/v1/[...path]/route';
import { proxyApi } from './proxy';
import { webConfig } from './config';
const config = webConfig({ APP_ENV: 'test' });
const id = '019a1234-1234-7123-8123-123456789abc';
it('CHG-040 / SEC-001: browser API route registers DELETE and PATCH', () => {
  expect(Reflect.get(route, 'DELETE')).toBeTypeOf('function');
  expect(Reflect.get(route, 'PATCH')).toBeTypeOf('function');
});
it('CHG-040: leaving a waiting list (DELETE) reaches the API with cookie and CSRF', async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
  const response = await proxyApi(
    new Request('http://localhost:3000/api/v1/me/waitlist/' + id, {
      method: 'DELETE',
      headers: {
        origin: config.WEB_ORIGIN,
        cookie: 'hsm_access=fixture',
        'x-csrf-token': 'fixture-csrf',
        'idempotency-key': id,
      },
    }),
    ['me', 'waitlist', id],
    config,
    transport,
  );
  expect(response.status).toBe(204);
  const [url, init] = transport.mock.calls[0] ?? [];
  expect(String(url)).toBe('http://127.0.0.1:4000/v1/me/waitlist/' + id);
  expect(init?.method).toBe('DELETE');
  expect(new Headers(init?.headers).get('x-csrf-token')).toBe('fixture-csrf');
});
it.each(['DELETE', 'PATCH'])(
  'SEC-001: %s cannot bypass exact-origin protection',
  async (method) => {
    const transport = vi.fn<typeof fetch>();
    const response = await proxyApi(
      new Request('http://localhost:3000/api/v1/me/waitlist/' + id, {
        method,
        headers: { origin: 'https://attacker.example' },
      }),
      ['me', 'waitlist', id],
      config,
      transport,
    );
    expect(response.status).toBe(403);
    expect(transport).not.toHaveBeenCalled();
  },
);
