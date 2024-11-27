import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createApiClient } from '@hsm/api-client';
import { completeRegistration, startRegistration, verifyRegistration } from './registration';
const setupToken = 's'.repeat(43);
const credentials = {
  client: 'mobile',
  expiresIn: 600,
  sessionId: randomUUID(),
  accessToken: 'a'.repeat(64),
  refreshToken: 'r'.repeat(64),
};
const profile = {
  user: {
    id: randomUUID(),
    fullName: 'New identity',
    email: 'identity@example.test',
    emailVerified: true,
    cnicLast4: null,
  },
  capabilities: { customer: false, owner: false, managerOf: [], admin: null },
};
function fixture(response: unknown, status = 200) {
  const requests: Request[] = [];
  const transport: typeof fetch = async (input, init) => {
    requests.push(input instanceof Request ? input : new Request(input, init));
    return Response.json(response, { status });
  };
  const client = createApiClient({
    baseUrl: 'https://api.example.test',
    fetch: transport,
    authentication: { kind: 'bearer', accessToken: async () => 'old credential must not be sent' },
  });
  const establish = vi.fn(async (work: () => Promise<unknown>) => work());
  return { client, establish, requests };
}
it('AUTH-C CHG-006: initial registration sends only canonical email and cannot establish an ordinary session', async () => {
  const wire = fixture({ verificationRequired: true });
  expect(await startRegistration(wire.client, { email: 'Identity@Example.Test' })).toBe(
    'identity@example.test',
  );
  expect(wire.requests[0]?.url).toBe('https://api.example.test/v1/auth/registration/start');
  expect(await wire.requests[0]?.clone().json()).toEqual({ email: 'identity@example.test' });
  expect(wire.requests[0]?.headers.has('authorization')).toBe(false);
  expect(wire.establish).not.toHaveBeenCalled();
});
it.each([
  { email: 'invalid' },
  { email: 'identity@example.test', password: 'Premature password' },
  { email: 'identity@example.test', phone: '+923001234567' },
])(
  'AUTH-C SEC: staged start rejects extra profile/credential input before any request',
  async (input) => {
    const wire = fixture({ verificationRequired: true });
    await expect(startRegistration(wire.client, input)).rejects.toThrow();
    expect(wire.requests).toHaveLength(0);
  },
);
it('AUTH-C SEC: persisted email verification returns a setup capability without session establishment', async () => {
  const result = { next: 'password', setupToken, expiresIn: 600 };
  const wire = fixture(result);
  expect(await verifyRegistration(wire.client, 'Identity@Example.Test', '123456')).toEqual(result);
  expect(await wire.requests[0]?.clone().json()).toEqual({
    email: 'identity@example.test',
    code: '123456',
  });
  expect(wire.requests[0]?.headers.has('authorization')).toBe(false);
  expect(wire.establish).not.toHaveBeenCalled();
});
it('AUTH-C: existing permanent accounts return to Login without issuing setup or session credentials', async () => {
  const wire = fixture({ next: 'login' });
  expect(await verifyRegistration(wire.client, 'identity@example.test', '123456')).toEqual({
    next: 'login',
  });
  expect(wire.establish).not.toHaveBeenCalled();
});
it.each([
  { next: 'password', setupToken: 'short', expiresIn: 600 },
  { next: 'password', setupToken, expiresIn: 3600 },
  { next: 'login', accessToken: credentials.accessToken },
  { ...credentials, ...profile },
])(
  'SEC: malformed verification or premature ordinary-session responses fail closed',
  async (response) => {
    const wire = fixture(response);
    await expect(
      verifyRegistration(wire.client, 'identity@example.test', '123456'),
    ).rejects.toThrow();
    expect(wire.establish).not.toHaveBeenCalled();
  },
);
it('AUTH-C SEC: permanent password setup uses the existing secure session establishment and persists credential fields only', async () => {
  const wire = fixture({ ...credentials, ...profile });
  expect(
    await completeRegistration(wire, setupToken, {
      password: 'Permanent private phrase',
      confirmPassword: 'Permanent private phrase',
    }),
  ).toEqual(credentials);
  expect(wire.establish).toHaveBeenCalledOnce();
  expect(wire.requests[0]?.url).toBe('https://api.example.test/v1/auth/registration/password');
  expect(await wire.requests[0]?.clone().json()).toEqual({
    setupToken,
    password: 'Permanent private phrase',
    client: 'mobile',
  });
  expect(wire.requests[0]?.headers.has('authorization')).toBe(false);
  expect(await wire.establish.mock.results[0]?.value).not.toHaveProperty('user');
});
it.each([
  { password: 'Permanent private phrase', confirmPassword: 'Different private phrase' },
  { password: 'short', confirmPassword: 'short' },
  {
    password: 'Permanent private phrase',
    confirmPassword: 'Permanent private phrase',
    client: 'web',
  },
])('AUTH-C SEC: invalid confirmation fails before establishment or API work', async (input) => {
  const wire = fixture({ ...credentials, ...profile });
  await expect(completeRegistration(wire, setupToken, input)).rejects.toThrow();
  expect(wire.establish).not.toHaveBeenCalled();
  expect(wire.requests).toHaveLength(0);
});
it('SEC: password failure and malformed session responses never yield credentials to the session provider', async () => {
  for (const [response, status] of [
    [{ code: 'TOKEN_EXPIRED', detail: 'Private provider error' }, 401],
    [{ ...credentials, client: 'web', ...profile }, 200],
  ] as const) {
    const wire = fixture(response, status);
    await expect(
      completeRegistration(wire, setupToken, {
        password: 'Permanent private phrase',
        confirmPassword: 'Permanent private phrase',
      }),
    ).rejects.toThrow();
    await expect(wire.establish.mock.results[0]?.value).rejects.toThrow();
  }
});
