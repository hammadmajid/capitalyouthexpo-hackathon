import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createApiClient } from '@hsm/api-client';
import { prepareLogin } from './login-input';
import { runAuth, type AuthFlowName } from './auth';
const session = {
  client: 'mobile',
  expiresIn: 600,
  sessionId: randomUUID(),
  accessToken: 'a'.repeat(64),
  refreshToken: 'r'.repeat(64),
};
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
function fixture(response: unknown, status = 200) {
  const requests: Request[] = [];
  const transport: typeof fetch = async (input, init) => {
    requests.push(input instanceof Request ? input : new Request(input, init));
    return Response.json(response, { status });
  };
  const client = createApiClient({
    baseUrl: 'https://api.example.com',
    fetch: transport,
    authentication: { kind: 'bearer', accessToken: async () => 'old credential must not be sent' },
  });
  const establish = vi.fn(async (work: () => Promise<unknown>) => work());
  return { client, establish, requests };
}
it.each<{ flow: AuthFlowName; path: string; values: Record<string, string> }>([
  {
    flow: 'login',
    path: 'login',
    values: { identifier: 'identity@example.com', password: 'Valid fixture password' },
  },
  {
    flow: 'verify',
    path: 'email/verify',
    values: { email: 'identity@example.com', code: '123456' },
  },
  {
    flow: 'activate',
    path: 'manager/activate',
    values: {
      phone: '+923000000000',
      tempPassword: 'Valid fixture temporary',
      newPassword: 'Valid fixture replacement',
    },
  },
])(
  'AUTH-C: $flow uses mobile transport and only persists credential fields',
  async ({ flow, path, values }) => {
    const wire = fixture({ ...session, ...profile });
    expect(await runAuth(flow, values, wire)).toBeUndefined();
    expect(wire.establish).toHaveBeenCalledOnce();
    expect(await wire.establish.mock.results[0]?.value).toEqual(session);
    expect(wire.requests[0]?.url).toBe('https://api.example.com/v1/auth/' + path);
    expect(wire.requests[0]?.headers.has('authorization')).toBe(false);
    expect(await wire.requests[0]?.clone().json()).toEqual({ ...values, client: 'mobile' });
  },
);
it.each<{ flow: AuthFlowName; path: string; response: unknown; values: Record<string, string> }>([
  {
    flow: 'register',
    path: 'register',
    response: { verificationRequired: true },
    values: {
      fullName: 'Identity',
      email: 'identity@example.com',
      phone: '+923000000000',
      password: 'Valid fixture password',
      gender: 'male',
      dateOfBirth: '2000-01-01',
      cnic: '3520200000000',
    },
  },
  {
    flow: 'resend',
    path: 'email/resend',
    response: { verificationRequired: true },
    values: { email: 'identity@example.com' },
  },
  {
    flow: 'recover',
    path: 'password/forgot',
    response: { accepted: true },
    values: { email: 'identity@example.com' },
  },
  {
    flow: 'reset',
    path: 'password/reset',
    response: { reset: true },
    values: {
      email: 'identity@example.com',
      code: '123456',
      newPassword: 'Valid fixture replacement',
    },
  },
])(
  'AUTH-C: $flow validates its public API acknowledgement',
  async ({ flow, path, response, values }) => {
    const wire = fixture(response);
    expect(typeof (await runAuth(flow, values, wire))).toBe('string');
    expect(wire.requests[0]?.url).toBe('https://api.example.com/v1/auth/' + path);
    expect(wire.requests[0]?.headers.has('authorization')).toBe(false);
    expect(wire.establish).not.toHaveBeenCalled();
  },
);
it.each<AuthFlowName>(['register', 'verify', 'resend', 'recover', 'reset', 'activate', 'login'])(
  'SEC-001: invalid $flow values never reach HTTP',
  async (flow) => {
    const wire = fixture({});
    await expect(runAuth(flow, {}, wire)).rejects.toThrow();
    expect(wire.requests).toHaveLength(0);
  },
);
it('SEC-001: malformed session response never persists provider payloads', async () => {
  const wire = fixture({ ...session, ...profile, privateDocument: 'private' });
  await expect(
    runAuth(
      'login',
      { identifier: 'identity@example.com', password: 'Valid fixture password' },
      wire,
    ),
  ).rejects.toThrow();
});

it.each(['03001234567', '923001234567', '+923001234567'])(
  'AUTH-M-005: selected phone %s reaches unchanged mobile login transport',
  async (phone) => {
    const wire = fixture({ ...session, ...profile });
    const prepared = prepareLogin({ email: '', phone, password: 'Valid fixture password' });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) throw new Error('Invalid test fixture');
    await runAuth('login', prepared.values, wire);
    expect(await wire.requests[0]?.clone().json()).toEqual({
      identifier: '+923001234567',
      password: 'Valid fixture password',
      client: 'mobile',
    });
    expect(wire.requests[0]?.headers.has('authorization')).toBe(false);
    expect(wire.establish).toHaveBeenCalledOnce();
  },
);
it('AUTH-M-003: activation accepts the invited number as typed (03…) and sends +92…', async () => {
  const wire = fixture({ ...session, ...profile });
  await runAuth(
    'activate',
    { phone: '0315 4796658', tempPassword: 'Temporary pass 1', newPassword: 'Replacement 12' },
    wire,
  );
  expect(await wire.requests[0]?.clone().json()).toMatchObject({ phone: '+923154796658' });
});
