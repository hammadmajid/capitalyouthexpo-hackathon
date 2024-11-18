import { expect, it, vi } from 'vitest';
import { createApiClient, type ApiClient } from './client.js';
function transport() {
  const requests: Request[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    requests.push(input instanceof Request ? input : new Request(input, init));
    return new Response('{}', { headers: { 'content-type': 'application/json' } });
  };
  return { requests, fetch };
}
it('SEC-001: cookie reads and mutations attach only the appropriate CSRF header', async () => {
  const wire = transport();
  const csrf = vi.fn(() => 'csrf-value');
  const client = createApiClient({
    baseUrl: 'http://localhost',
    authentication: { kind: 'cookie', csrf },
    fetch: wire.fetch,
  });
  await client.GET('/v1/me');
  await client.POST('/v1/auth/refresh', { body: {} });
  expect(wire.requests[0]?.credentials).toBe('include');
  expect(wire.requests[0]?.headers.has('X-CSRF-Token')).toBe(false);
  expect(wire.requests[1]?.headers.get('X-CSRF-Token')).toBe('csrf-value');
  expect(wire.requests[1]?.headers.has('Authorization')).toBe(false);
  expect(csrf).toHaveBeenCalledTimes(1);
});
it('SEC-001: cookie mutations without a token do not invent CSRF authorization', async () => {
  const wire = transport();
  const client = createApiClient({
    baseUrl: 'http://localhost',
    authentication: { kind: 'cookie', csrf: () => undefined },
    fetch: wire.fetch,
  });
  await client.POST('/v1/auth/refresh', { body: {} });
  expect(wire.requests[0]?.headers.has('X-CSRF-Token')).toBe(false);
});
it.each(['access-token', undefined])(
  'SEC-001: mobile private requests use optional bearer credentials without cookies',
  async (token) => {
    const wire = transport();
    const client = createApiClient({
      baseUrl: 'http://localhost',
      authentication: { kind: 'bearer', accessToken: async () => token },
      fetch: wire.fetch,
    });
    await client.GET('/v1/me');
    expect(wire.requests[0]?.credentials).toBe('omit');
    expect(wire.requests[0]?.headers.get('Authorization')).toBe(token ? 'Bearer ' + token : null);
  },
);
it('SEC-001: refresh and health do not attach an access token', async () => {
  const wire = transport();
  const accessToken = vi.fn(async () => 'access-token');
  const client = createApiClient({
    baseUrl: 'http://localhost',
    authentication: { kind: 'bearer', accessToken },
    fetch: wire.fetch,
  });
  await client.POST('/v1/auth/refresh', { body: { refreshToken: 'a'.repeat(40) } });
  await client.GET('/v1/health/live');
  expect(accessToken).not.toHaveBeenCalled();
  expect(wire.requests.every((request) => !request.headers.has('Authorization'))).toBe(true);
});
it('SEC-001: uses the native transport when no custom transport is supplied', () => {
  expect(
    createApiClient({
      baseUrl: 'http://localhost',
      authentication: { kind: 'cookie', csrf: () => undefined },
    }),
  ).toBeDefined();
});

it.each([
  {
    path: 'registration/start',
    run: (client: ApiClient) =>
      client.POST('/v1/auth/registration/start', { body: { email: 'identity@example.test' } }),
  },
  {
    path: 'registration/verify',
    run: (client: ApiClient) =>
      client.POST('/v1/auth/registration/verify', {
        body: { email: 'identity@example.test', code: '123456' },
      }),
  },
  {
    path: 'registration/password',
    run: (client: ApiClient) =>
      client.POST('/v1/auth/registration/password', {
        body: { setupToken: 's'.repeat(43), password: 'Permanent test phrase', client: 'mobile' },
      }),
  },
])(
  'AUTH-C CHG-006 SEC: public $path never reads or sends existing bearer credentials',
  async ({ run }) => {
    const wire = transport(),
      accessToken = vi.fn(async () => 'old access credential');
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      fetch: wire.fetch,
      authentication: { kind: 'bearer', accessToken },
    });
    await run(client);
    expect(accessToken).not.toHaveBeenCalled();
    expect(wire.requests[0]?.headers.has('Authorization')).toBe(false);
    expect(wire.requests[0]?.credentials).toBe('omit');
  },
);

it('HMA-015: current clients advertise profile-review metadata compatibility', async () => {
  const wire = transport();
  const client = createApiClient({
    baseUrl: 'http://localhost',
    authentication: { kind: 'cookie', csrf: () => undefined },
    fetch: wire.fetch,
  });
  await client.GET('/v1/me');
  expect(wire.requests[0]?.headers.get('x-hsm-profile-reviews')).toBe('1');
});
