// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { webConfig } from './config';
import { proxyApi } from './proxy';
const config = webConfig({ APP_ENV: 'test' });
function request(method = 'GET', body?: string, headers: Record<string, string> = {}) {
  return new Request('http://localhost:3000/api/v1/me?limit=10', {
    method,
    headers,
    ...(body === undefined ? {} : { body }),
  });
}
function rejected(code: string, status = 401) {
  return {
    type: 'https://example.com/problem',
    title: 'Unavailable',
    code,
    status,
    detail: 'Unavailable',
    traceId: 'trace',
  };
}
it('SEC-001: forwards only selected headers, cookies and bounded paths to the configured API', async () => {
  const headers = new Headers({
    'content-type': 'application/json',
    'x-request-id': 'trusted-trace',
    server: 'private',
    'ratelimit-remaining': '2',
  });
  headers.append('set-cookie', 'hsm_access=credential; HttpOnly; Path=/');
  headers.append('set-cookie', 'hsm_csrf=csrf; Path=/');
  const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { headers }));
  const result = await proxyApi(
    request('GET', undefined, {
      cookie: 'hsm_access=credential',
      authorization: 'Bearer private',
      'x-request-id': 'untrusted',
      'x-csrf-token': 'csrf',
      'idempotency-key': 'key',
    }),
    ['me'],
    config,
    transport,
  );
  const [url, init] = transport.mock.calls[0] ?? [];
  expect(String(url)).toBe('http://127.0.0.1:4000/v1/me?limit=10');
  const sent = new Headers(init?.headers);
  expect(sent.get('cookie')).toBe('hsm_access=credential');
  expect(sent.get('origin')).toBe('http://localhost:3000');
  expect(sent.get('authorization')).toBeNull();
  expect(sent.get('x-request-id')).toBeNull();
  expect(sent.get('x-csrf-token')).toBe('csrf');
  expect(sent.get('idempotency-key')).toBe('key');
  expect(init).toMatchObject({ redirect: 'error', cache: 'no-store' });
  expect(result.headers.get('cache-control')).toBe('no-store');
  expect(result.headers.get('server')).toBeNull();
  expect(result.headers.get('x-request-id')).toBe('trusted-trace');
  expect(result.headers.getSetCookie()).toHaveLength(2);
});
it.each(
  [[], ['..'], ['auth/refresh'], ['%2f%2fevil.example'], ['bad_name']].map((path) => ({ path })),
)('SEC-001: invalid proxy paths fail before transport', async ({ path }) => {
  const transport = vi.fn<typeof fetch>();
  expect((await proxyApi(request(), path, config, transport)).status).toBe(400);
  expect(transport).not.toHaveBeenCalled();
});
it.each([undefined, 'https://attacker.example'])(
  'SEC-001: unsafe requests require the exact configured origin',
  async (origin) => {
    const transport = vi.fn<typeof fetch>();
    const headers = origin ? { origin } : {};
    const result = await proxyApi(
      request('POST', '{}', headers),
      ['auth', 'refresh'],
      config,
      transport,
    );
    expect(result.status).toBe(403);
    expect(transport).not.toHaveBeenCalled();
  },
);
it('SEC-001: valid cookie mutations retain JSON and CSRF while empty-body logout remains supported', async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => Response.json({ accepted: true }));
  const input = request('POST', '{"value":1}', {
    origin: config.WEB_ORIGIN,
    'content-type': 'application/json',
    'x-csrf-token': 'csrf',
  });
  expect((await proxyApi(input, ['auth', 'refresh'], config, transport)).status).toBe(200);
  expect(new TextDecoder().decode(transport.mock.calls[0]?.[1]?.body as Uint8Array)).toBe(
    '{"value":1}',
  );
  expect(
    (
      await proxyApi(
        request('POST', undefined, { origin: config.WEB_ORIGIN }),
        ['auth', 'logout'],
        config,
        transport,
      )
    ).status,
  ).toBe(200);
});
it.each(['application/x-www-form-urlencoded', 'text/plain', 'application/jsonp'])(
  'SEC-001: form submissions cannot tunnel authentication mutations',
  async (type) => {
    const transport = vi.fn<typeof fetch>();
    expect(
      (
        await proxyApi(
          request('POST', 'private=value', { origin: config.WEB_ORIGIN, 'content-type': type }),
          ['auth', 'login'],
          config,
          transport,
        )
      ).status,
    ).toBe(400);
    expect(transport).not.toHaveBeenCalled();
  },
);
it('SEC-001: oversized bodies are rejected before upstream delivery', async () => {
  const transport = vi.fn<typeof fetch>();
  expect(
    (
      await proxyApi(
        request('POST', 'x'.repeat(1048577), {
          origin: config.WEB_ORIGIN,
          'content-type': 'application/json',
        }),
        ['auth', 'login'],
        config,
        transport,
      )
    ).status,
  ).toBe(400);
  expect(transport).not.toHaveBeenCalled();
});
it('SEC-003: network errors return a sanitized correlated problem', async () => {
  const transport = vi.fn<typeof fetch>().mockRejectedValue(new Error('PRIVATE_MARKER'));
  const result = await proxyApi(request(), ['me'], config, transport);
  expect(result.status).toBe(503);
  expect(result.headers.get('content-type')).toBe('application/problem+json');
  const text = await result.text();
  expect(text).not.toContain('PRIVATE_MARKER');
  expect(JSON.parse(text)).toMatchObject({
    code: 'INTERNAL',
    status: 503,
    traceId: expect.any(String),
  });
});
it.each(['test', 'production'] as const)(
  'SEC-001: confirmed revoked families expire the matching browser credentials',
  async (APP_ENV) => {
    const deployed = webConfig({
      APP_ENV,
      WEB_ORIGIN: 'https://app.example.com',
      API_ORIGIN: 'https://api.example.com',
    });
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(rejected('SESSION_REVOKED'), { status: 401 }));
    const result = await proxyApi(request(), ['me'], deployed, transport);
    const cookies = result.headers.getSetCookie();
    expect(cookies).toHaveLength(3);
    expect(cookies.every((cookie) => cookie.includes('Max-Age=0'))).toBe(true);
    expect(
      cookies.every((cookie) =>
        cookie.startsWith(APP_ENV === 'production' ? '__Host-hsm_' : 'hsm_'),
      ),
    ).toBe(true);
    expect(cookies[0]?.includes('; Secure')).toBe(APP_ENV === 'production');
  },
);
it.each([rejected('TOKEN_EXPIRED'), rejected('SESSION_REVOKED', 400), { invalid: true }])(
  'SEC-001: expired access and invalid problems preserve refresh credentials',
  async (problem) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(problem, { status: 401 }));
    expect(
      (await proxyApi(request(), ['me'], config, transport)).headers.getSetCookie(),
    ).toHaveLength(0);
  },
);
it('SEC-003: malformed upstream JSON does not crash the proxy', async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('{', { status: 401 }));
  expect((await proxyApi(request(), ['me'], config, transport)).status).toBe(401);
});

it.each([undefined, 'application/json'])(
  'SEC-001: empty streamed HTTP mutations preserve bodyless logout (%s)',
  async (contentType) => {
    const transport = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
      expect(options?.body).toBeUndefined();
      expect(new Headers(options?.headers).has('content-type')).toBe(false);
      return Response.json({ revoked: true });
    });
    const headers = new Headers({ origin: config.WEB_ORIGIN, 'x-csrf-token': 'csrf' });
    if (contentType) headers.set('content-type', contentType);
    const input = new Request(config.WEB_ORIGIN + '/api/v1/auth/logout', {
      method: 'POST',
      headers,
      body: new Uint8Array(0),
    });
    expect(input.body).not.toBeNull();
    expect((await proxyApi(input, ['auth', 'logout'], config, transport)).status).toBe(200);
    expect(transport).toHaveBeenCalledOnce();
  },
);

it('TRUST-006 / SEC-001: listing preconditions and ETags cross the private proxy without forwarding credentials or enabling caching', async () => {
  const version = 'a'.repeat(64),
    etag = '"' + version + '"';
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json(
        { version },
        { headers: { etag, server: 'private', 'cache-control': 'public' } },
      ),
    );
  const response = await proxyApi(
    request('PUT', '{}', {
      origin: config.WEB_ORIGIN,
      'content-type': 'application/json',
      'x-csrf-token': 'csrf',
      'idempotency-key': 'key',
      'if-match': etag,
      authorization: 'Bearer untrusted',
    }),
    ['branches', '019a1234-1234-7123-8123-123456789abc', 'listing'],
    config,
    transport,
  );
  const sent = new Headers(transport.mock.calls[0]?.[1]?.headers);
  expect(sent.get('if-match')).toBe(etag);
  expect(sent.get('authorization')).toBeNull();
  expect(response.headers.get('etag')).toBe(etag);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('server')).toBeNull();
});
it('SEC-001: the edge client address reaches the API so per-client rate limits are not shared', async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'));
  await proxyApi(
    request('GET', undefined, { 'x-forwarded-for': '203.0.113.7' }),
    ['me'],
    config,
    transport,
  );
  expect(new Headers(transport.mock.calls[0]?.[1]?.headers).get('x-forwarded-for')).toBe(
    '203.0.113.7',
  );
  await proxyApi(request(), ['me'], config, transport);
  expect(new Headers(transport.mock.calls[1]?.[1]?.headers).has('x-forwarded-for')).toBe(false);
});
it('RPT-001/002: report downloads keep their attachment name through the proxy', async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(
    new Response('"a"\r\n', {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="r.csv"',
      },
    }),
  );
  const response = await proxyApi(
    request('GET'),
    ['owner', 'reports', 'residents'],
    config,
    transport,
  );
  expect(response.headers.get('content-disposition')).toBe('attachment; filename="r.csv"');
  expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
});

it.each([
  ['me', 'profile-reviews', 'profile_photo'],
  ['admin', 'profile-reviews', 'profile_photo', 'subjects'],
  [
    'admin',
    'profile-reviews',
    'profile_photo',
    '10000000-0000-4000-8000-000000000001',
    'decisions',
  ],
])(
  'HMA-015 SEC-001: documented photo review paths reach the authenticated API',
  async (...path) => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 201 }));
    const result = await proxyApi(
      request('POST', '{}', {
        origin: config.WEB_ORIGIN,
        'content-type': 'application/json',
        'x-csrf-token': 'csrf',
      }),
      path,
      config,
      transport,
    );
    expect(result.status).toBe(201);
    expect(new URL(String(transport.mock.calls[0]?.[0])).pathname).toBe('/v1/' + path.join('/'));
  },
);

it.each([
  ['me', 'profile_photo'],
  ['owner', 'profile-reviews', 'profile_photo'],
  ['admin', 'other', 'profile_photo'],
  ['me', 'profile-reviews', 'profile_photo/..'],
])(
  'HMA-015 SEC-001: photo path exception cannot open other underscore or traversal paths',
  async (...path) => {
    const transport = vi.fn<typeof fetch>();
    expect((await proxyApi(request(), path, config, transport)).status).toBe(400);
    expect(transport).not.toHaveBeenCalled();
  },
);

it('HMA-015: forwards explicit client metadata compatibility without inventing authorization', async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'));
  await proxyApi(
    request('GET', undefined, { 'x-hsm-profile-reviews': '1' }),
    ['me'],
    config,
    transport,
  );
  const sent = new Headers(transport.mock.calls[0]?.[1]?.headers);
  expect(sent.get('x-hsm-profile-reviews')).toBe('1');
  expect(sent.has('authorization')).toBe(false);
  expect(sent.has('x-csrf-token')).toBe(false);
});
