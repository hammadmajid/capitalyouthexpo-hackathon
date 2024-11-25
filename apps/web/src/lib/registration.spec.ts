import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createApiClient } from '@hsm/api-client';
import { completeRegistration, startRegistration, verifyRegistration } from './registration';
const setupToken = 's'.repeat(43);
const profile = {
  user: {
    id: randomUUID(),
    fullName: '',
    email: 'identity@example.test',
    emailVerified: true,
    cnicLast4: null,
  },
  capabilities: { customer: false, owner: false, managerOf: [], admin: null },
};
const session = { ...profile, client: 'web', sessionId: randomUUID(), expiresIn: 600 };
function fixture(responses: unknown[]) {
  const requests: Request[] = [];
  const client = createApiClient({
    baseUrl: 'https://web.example.test/api',
    authentication: { kind: 'cookie', csrf: () => 'csrf' },
    fetch: async (value, init) => {
      requests.push(value instanceof Request ? value : new Request(value, init));
      return Response.json(responses.shift());
    },
  });
  return { client, requests };
}
it('AUTH-C CHG-006: web start sends email alone without ordinary session credentials', async () => {
  const wire = fixture([{ verificationRequired: true }]);
  expect(await startRegistration(wire.client, { email: 'Identity@Example.Test' })).toBe(
    'identity@example.test',
  );
  expect(await wire.requests[0]?.clone().json()).toEqual({ email: 'identity@example.test' });
  expect(wire.requests[0]?.headers.has('authorization')).toBe(false);
});
it.each([
  { email: 'invalid' },
  { email: 'identity@example.test', password: 'Premature credential' },
])('AUTH-C: malformed or premature web registration fields cannot reach the API', async (input) => {
  const wire = fixture([]);
  await expect(startRegistration(wire.client, input)).rejects.toThrow();
  expect(wire.requests).toHaveLength(0);
});
it('AUTH-C: email verification returns a temporary setup grant without password setup or profile access', async () => {
  const result = { next: 'password', setupToken, expiresIn: 600 };
  const wire = fixture([result]);
  expect(await verifyRegistration(wire.client, 'identity@example.test', '123456')).toEqual(result);
  expect(wire.requests).toHaveLength(1);
  expect(wire.requests[0]?.url).toBe('https://web.example.test/api/v1/auth/registration/verify');
});
it('AUTH-C: an existing permanent identity returns to Login without issuing a new credential', async () => {
  const wire = fixture([{ next: 'login' }]);
  expect(await verifyRegistration(wire.client, 'identity@example.test', '123456')).toEqual({
    next: 'login',
  });
});
it('SEC: premature ordinary-session verification responses are rejected', async () => {
  const wire = fixture([
    { next: 'password', setupToken, expiresIn: 600, accessToken: 'premature' },
  ]);
  await expect(
    verifyRegistration(wire.client, 'identity@example.test', '123456'),
  ).rejects.toThrow();
});
it('AUTH-C SEC: password setup selects web cookie transport and reads fresh capabilities', async () => {
  const wire = fixture([session, profile]);
  expect(
    await completeRegistration(wire.client, setupToken, {
      password: 'Permanent private phrase',
      confirmPassword: 'Permanent private phrase',
    }),
  ).toEqual(profile);
  expect(await wire.requests[0]?.clone().json()).toEqual({
    setupToken,
    password: 'Permanent private phrase',
    client: 'web',
  });
  expect(wire.requests[1]?.method).toBe('GET');
  expect(wire.requests[1]?.url).toBe('https://web.example.test/api/v1/me');
  expect(wire.requests.every((request) => !request.headers.has('authorization'))).toBe(true);
});
it.each([
  { password: 'short', confirmPassword: 'short' },
  { password: 'Permanent private phrase', confirmPassword: 'Different private phrase' },
  {
    password: 'Permanent private phrase',
    confirmPassword: 'Permanent private phrase',
    client: 'mobile',
  },
])(
  'AUTH-C: invalid confirmation or caller-selected transport never reaches the web API',
  async (input) => {
    const wire = fixture([]);
    await expect(completeRegistration(wire.client, setupToken, input)).rejects.toThrow();
    expect(wire.requests).toHaveLength(0);
  },
);
it('SEC: mobile credential payloads cannot be accepted as web cookie sessions', async () => {
  const wire = fixture([
    { ...session, client: 'mobile', accessToken: 'private', refreshToken: 'private' },
  ]);
  await expect(
    completeRegistration(wire.client, setupToken, {
      password: 'Permanent private phrase',
      confirmPassword: 'Permanent private phrase',
    }),
  ).rejects.toThrow();
  expect(wire.requests).toHaveLength(1);
});
it('SEC: a mismatched fresh identity cannot enter a selected experience', async () => {
  const wire = fixture([session, { ...profile, user: { ...profile.user, id: randomUUID() } }]);
  await expect(
    completeRegistration(wire.client, setupToken, {
      password: 'Permanent private phrase',
      confirmPassword: 'Permanent private phrase',
    }),
  ).rejects.toThrow('Profile confirmation unavailable');
});
