// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createApiClient } from '@hsm/api-client';
import { restoreSession, webLoginSchema } from './session';
const profile = {
  user: {
    id: randomUUID(),
    fullName: 'Identity',
    email: null,
    emailVerified: true,
    cnicLast4: null,
  },
  capabilities: { customer: true, owner: false, managerOf: [], admin: null },
};
const credentials = { client: 'web', expiresIn: 600, sessionId: randomUUID() };
function failure(code: string, status = 401) {
  return {
    type: 'https://example.com/problem',
    title: 'Failed',
    status,
    code,
    detail: 'Unavailable',
    traceId: 'trace',
  };
}
function fixture(responses: { body: unknown; status?: number }[]) {
  const requests: Request[] = [];
  const transport: typeof fetch = async (input, init) => {
    requests.push(input instanceof Request ? input : new Request(input, init));
    const next = responses.shift();
    if (!next) throw new Error('Unexpected request');
    return Response.json(next.body, { status: next.status ?? 200 });
  };
  const client = createApiClient({
    baseUrl: 'http://localhost/api',
    authentication: { kind: 'cookie', csrf: () => 'csrf-value' },
    fetch: transport,
  });
  return { requests, client };
}
it('AUTH-C: valid sessions restore with one private profile request', async () => {
  const wire = fixture([{ body: profile }]);
  expect(await restoreSession(wire.client, () => false)).toEqual(profile);
  expect(wire.requests[0]?.url).toBe('http://localhost/api/v1/me');
});
it.each(['TOKEN_EXPIRED', 'UNAUTHENTICATED'])(
  'AUTH-C: expired access refreshes once using cookies and restores live grants',
  async (code) => {
    const wire = fixture([
      { body: failure(code), status: 401 },
      { body: credentials },
      { body: profile },
    ]);
    expect(await restoreSession(wire.client, () => true)).toEqual(profile);
    expect(wire.requests).toHaveLength(3);
    expect(await wire.requests[1]?.clone().json()).toEqual({});
    expect(wire.requests[1]?.headers.get('x-csrf-token')).toBe('csrf-value');
    expect(wire.requests[1]?.headers.has('authorization')).toBe(false);
  },
);
it.each(['SESSION_REVOKED', 'ACCOUNT_SUSPENDED'])(
  'SEC-001: terminal session/account rejection never attempts refresh',
  async (code) => {
    const wire = fixture([{ body: failure(code), status: 401 }]);
    await expect(restoreSession(wire.client, () => true)).rejects.toMatchObject({ code });
    expect(wire.requests).toHaveLength(1);
  },
);
it('SEC-001: missing refresh hints and malformed profiles do not trigger refresh', async () => {
  const wire = fixture([{ body: failure('UNAUTHENTICATED'), status: 401 }]);
  await expect(restoreSession(wire.client, () => false)).rejects.toMatchObject({
    code: 'UNAUTHENTICATED',
  });
  const malformed = fixture([{ body: { ...profile, secret: 'private' } }]);
  await expect(restoreSession(malformed.client, () => true)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});
it('SEC-001: failed refresh is not retried recursively', async () => {
  const wire = fixture([
    { body: failure('TOKEN_EXPIRED'), status: 401 },
    { body: failure('SESSION_REVOKED'), status: 401 },
  ]);
  await expect(restoreSession(wire.client, () => true)).rejects.toMatchObject({
    code: 'SESSION_REVOKED',
  });
  expect(wire.requests).toHaveLength(2);
});
it('SEC-001: web authentication responses cannot contain bearer credentials', () => {
  expect(webLoginSchema.parse({ ...credentials, ...profile })).toEqual({
    ...credentials,
    ...profile,
  });
  expect(
    webLoginSchema.safeParse({ ...credentials, ...profile, accessToken: 'private' }).success,
  ).toBe(false);
});
it('SEC-001: refresh coordination reloads live identity after another tab rotates cookies', async () => {
  const wire = fixture([{ body: failure('TOKEN_EXPIRED'), status: 401 }, { body: profile }]);
  let coordinated = 0;
  expect(
    await restoreSession(
      wire.client,
      () => true,
      async (work) => {
        coordinated++;
        return work();
      },
    ),
  ).toEqual(profile);
  expect(coordinated).toBe(1);
  expect(wire.requests.map((request) => request.method)).toEqual(['GET', 'GET']);
});
it('SEC-001: coordinated refresh rotates once only when access remains expired', async () => {
  const wire = fixture([
    { body: failure('TOKEN_EXPIRED'), status: 401 },
    { body: failure('TOKEN_EXPIRED'), status: 401 },
    { body: credentials },
    { body: profile },
  ]);
  expect(
    await restoreSession(
      wire.client,
      () => true,
      async (work) => work(),
    ),
  ).toEqual(profile);
  expect(wire.requests.map((request) => request.method)).toEqual(['GET', 'GET', 'POST', 'GET']);
});
