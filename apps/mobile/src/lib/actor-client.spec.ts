import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { bindActorClient, createActorClientBinder } from './actor-client';
const actorId = randomUUID();
const profile = {
  user: { id: actorId, fullName: 'Identity', email: null, emailVerified: true, cnicLast4: null },
  capabilities: { customer: true, owner: false, managerOf: [], admin: null },
};
it('SEC-003 shares verification for the exact token without late credential substitution', async () => {
  const value = wire();
  let token: string | undefined = 'first-token';
  const bind = createActorClientBinder({
    baseUrl: 'https://api.example.test',
    accessToken: async () => token,
    fetch: value.transport,
  });
  const [first, second] = await Promise.all([bind(actorId), bind(actorId)]);
  expect(first).toBe(second);
  expect(await bind(actorId)).toBe(first);
  expect(value.requests).toHaveLength(1);
  token = 'new-token';
  expect(await bind(actorId)).not.toBe(first);
  expect(value.requests).toHaveLength(2);
  await first.GET('/v1/me');
  expect(value.requests[2]?.headers.get('Authorization')).toBe('Bearer first-token');
  await expect(bind(randomUUID())).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  token = undefined;
  await expect(bind(actorId)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('SEC-003 never caches rejected identity verification', async () => {
  const value = wire({ ...profile, user: { ...profile.user, id: randomUUID() } });
  const bind = createActorClientBinder({
    baseUrl: 'https://api.example.test',
    accessToken: async () => 'token',
    fetch: value.transport,
  });
  await expect(bind(actorId)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  await expect(bind(actorId)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  expect(value.requests).toHaveLength(2);
});
afterEach(() => vi.unstubAllGlobals());
function wire(body: unknown = profile, status = 200) {
  const requests: Request[] = [];
  const transport: typeof fetch = async (input, init) => {
    requests.push(input instanceof Request ? input : new Request(input, init));
    return Response.json(body, { status });
  };
  return { requests, transport };
}
it('SEC-003: verified client freezes credentials even when the vault later contains another account', async () => {
  const value = wire();
  let token = 'first-account-token';
  const read = vi.fn(async () => token);
  const bound = await bindActorClient(
    { baseUrl: 'https://api.example.test', accessToken: read, fetch: value.transport },
    actorId,
  );
  token = 'replacement-account-token';
  await bound.GET('/v1/me');
  expect(read).toHaveBeenCalledTimes(1);
  expect(value.requests).toHaveLength(2);
  expect(
    value.requests.every(
      (request) => request.headers.get('Authorization') === 'Bearer first-account-token',
    ),
  ).toBe(true);
});
it('SEC-003: a late token read resolving to another account fails before private work', async () => {
  const value = wire({ ...profile, user: { ...profile.user, id: randomUUID() } });
  await expect(
    bindActorClient(
      {
        baseUrl: 'https://api.example.test',
        accessToken: async () => 'replacement-account-token',
        fetch: value.transport,
      },
      actorId,
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  expect(value.requests).toHaveLength(1);
  expect(value.requests[0]?.method).toBe('GET');
  expect(new URL(value.requests[0]?.url ?? '').pathname).toBe('/v1/me');
});
it('SEC-003: absent credentials cannot send any request', async () => {
  const value = wire();
  await expect(
    bindActorClient(
      {
        baseUrl: 'https://api.example.test',
        accessToken: async () => undefined,
        fetch: value.transport,
      },
      actorId,
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  expect(value.requests).toHaveLength(0);
});
it('SEC-003: malformed actor scope fails before reading credentials', async () => {
  const read = vi.fn();
  await expect(
    bindActorClient({ baseUrl: 'https://api.example.test', accessToken: read }, 'invalid'),
  ).rejects.toThrow();
  expect(read).not.toHaveBeenCalled();
});
it('SEC-003: the identity verification response stays strict', async () => {
  const value = wire({ ...profile, privateAddress: 'Must not be accepted' });
  await expect(
    bindActorClient(
      {
        baseUrl: 'https://api.example.test',
        accessToken: async () => 'token',
        fetch: value.transport,
      },
      actorId,
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('SEC-003: revoked sessions retain their actual server denial', async () => {
  const value = wire(
    {
      type: 'https://api.example.test/problem',
      title: 'Revoked',
      status: 401,
      code: 'SESSION_REVOKED',
      detail: 'Unavailable',
      traceId: 'fixture',
    },
    401,
  );
  await expect(
    bindActorClient(
      {
        baseUrl: 'https://api.example.test',
        accessToken: async () => 'token',
        fetch: value.transport,
      },
      actorId,
    ),
  ).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
});
it('SEC-003: platform fetch is used when no injected transport is supplied', async () => {
  const value = wire();
  vi.stubGlobal('fetch', value.transport);
  await expect(
    bindActorClient(
      { baseUrl: 'https://api.example.test', accessToken: async () => 'token' },
      actorId,
    ),
  ).resolves.toBeDefined();
  expect(value.requests).toHaveLength(1);
});
function expiring(tokens: { valid: string }) {
  const requests: Request[] = [];
  const transport: typeof fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    requests.push(request);
    if (request.headers.get('Authorization') !== 'Bearer ' + tokens.valid)
      return Response.json(
        {
          type: 'about:blank',
          title: 'Expired',
          status: 401,
          code: 'TOKEN_EXPIRED',
          detail: 'x',
          traceId: 't',
        },
        { status: 401 },
      );
    return Response.json(profile);
  };
  return { requests, transport };
}
it('AUTH: an expired access token is renewed for the same actor and the request retried once', async () => {
  const tokens = { valid: 'first-token' };
  const value = expiring(tokens);
  const renew = vi.fn(async () => ({ actorId, token: 'second-token' }));
  const bound = await bindActorClient(
    {
      baseUrl: 'https://api.example.test',
      accessToken: async () => 'first-token',
      fetch: value.transport,
      renew,
    },
    actorId,
  );
  tokens.valid = 'second-token';
  const { response } = await bound.GET('/v1/me');
  expect(response.status).toBe(200);
  expect(renew).toHaveBeenCalledTimes(1);
  await bound.GET('/v1/me');
  expect(value.requests.at(-1)?.headers.get('Authorization')).toBe('Bearer second-token');
});
it('SEC-003: a renewed token for another account is never used', async () => {
  const tokens = { valid: 'first-token' };
  const value = expiring(tokens);
  const bound = await bindActorClient(
    {
      baseUrl: 'https://api.example.test',
      accessToken: async () => 'first-token',
      fetch: value.transport,
      renew: async () => ({ actorId: randomUUID(), token: 'other-account' }),
    },
    actorId,
  );
  tokens.valid = 'other-account';
  const { response } = await bound.GET('/v1/me');
  expect(response.status).toBe(401);
  expect(
    value.requests.filter((r) => r.headers.get('Authorization') === 'Bearer other-account'),
  ).toHaveLength(0);
});
