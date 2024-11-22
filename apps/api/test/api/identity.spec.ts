import { selfProfileSchema } from '@hsm/contracts';
import { z } from 'zod';
import { testKeys } from '../keys.js';
import { randomBytes, randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterEach, expect, it, vi } from 'vitest';
import { createApplication } from '../../src/app.js';
import { parseEnvironment } from '../../src/config.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { AuthTransport } from '../../src/auth/transport.js';
import type { IdentityService } from '../../src/auth/identity.service.js';
import type { SessionService } from '../../src/auth/session.service.js';
import type { OtpService } from '../../src/auth/otp.service.js';
vi.setConfig({ testTimeout: 30000 });
const crypto = new AuthCrypto({
  JWT_SECRET: randomBytes(48).toString('hex'),
  CNIC_HASH_KEY: randomBytes(32).toString('hex'),
  CNIC_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
});
const credentials = {
  accessToken: 'access',
  refreshToken: 'refresh',
  sessionId: 'session',
  expiresIn: 600,
  client: 'mobile' as const,
};
const applications: NestFastifyApplication[] = [];
async function setup() {
  const identity = {
    register: vi.fn().mockResolvedValue({ verificationRequired: true }),
    login: vi.fn().mockResolvedValue(credentials),
    verifyEmail: vi.fn().mockResolvedValue(credentials),
    resetPassword: vi.fn().mockResolvedValue({ reset: true }),
  };
  const userId = randomUUID();
  const profiles = {
    read: vi.fn().mockResolvedValue({
      user: {
        id: userId,
        fullName: 'Self',
        email: 'self@example.com',
        emailVerified: true,
        cnicLast4: '5671',
      },
      capabilities: { customer: true, owner: false, managerOf: [], admin: null },
    }),
  };
  const sessions = { authenticate: vi.fn().mockResolvedValue({ userId, sessionId: randomUUID() }) };
  const otp = { request: vi.fn().mockResolvedValue(undefined) };
  const app = await createApplication(
    parseEnvironment({
      ...testKeys(),
      APP_ENV: 'test',
      DATABASE_URL: 'postgres://localhost/test',
      REDIS_URL: 'redis://localhost',
      CORS_ORIGINS: 'http://localhost:3000',
      LOG_LEVEL: 'silent',
    }),
    {
      postgres: async () => undefined,
      redis: async () => undefined,
      increment: async () => 1,
      close: async () => undefined,
    },
    [],
    {
      sessions: sessions as unknown as SessionService,
      profiles,
      transport: new AuthTransport(crypto, false),
      identity: identity as unknown as IdentityService,
      otp: otp as unknown as OtpService,
    },
  );
  applications.push(app);
  return { server: app.getHttpAdapter().getInstance(), identity, otp, profiles };
}
afterEach(async () => {
  await Promise.all(applications.splice(0).map((app) => app.close()));
});
it('AUTH-C-001/002: registration, email verification and resend use strict shared boundaries', async () => {
  const { server, identity, otp } = await setup();
  const registration = {
    fullName: 'Test Identity',
    email: 'USER@example.com',
    phone: '+923001234567',
    password: 'secure password',
    gender: 'male',
    dateOfBirth: '2000-01-01',
    cnic: '35202-1234567-1',
  };
  expect(
    (await server.inject({ method: 'POST', url: '/v1/auth/register', payload: registration }))
      .statusCode,
  ).toBe(202);
  expect(identity.register).toHaveBeenCalledWith(
    expect.objectContaining({ email: 'user@example.com', cnic: '3520212345671' }),
  );
  const verified = await server.inject({
    method: 'POST',
    url: '/v1/auth/email/verify',
    payload: { email: 'USER@example.com', code: '123456' },
  });
  expect(verified.statusCode).toBe(200);
  expect(verified.json().accessToken).toBe('access');
  expect(identity.verifyEmail).toHaveBeenCalledWith('user@example.com', '123456', 'mobile');
  expect(
    (
      await server.inject({
        method: 'POST',
        url: '/v1/auth/email/resend',
        payload: { email: 'USER@example.com' },
      })
    ).statusCode,
  ).toBe(202);
  expect(otp.request).toHaveBeenCalledWith('user@example.com', 'signup_verify');
  expect(
    (
      await server.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: { ...registration, isAdmin: true },
      })
    ).statusCode,
  ).toBe(400);
});
it('SEC: login and recovery map to services and expose no web token body', async () => {
  const { server, identity, otp } = await setup();
  identity.login.mockResolvedValue({
    ...credentials,
    client: 'web',
  } as unknown as typeof credentials);
  const login = await server.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: { identifier: 'user@example.com', password: 'secure password', client: 'web' },
  });
  expect(login.statusCode).toBe(200);
  expect(login.json()).not.toHaveProperty('accessToken');
  expect(login.headers['set-cookie']).toHaveLength(3);
  const forgot = await server.inject({
    method: 'POST',
    url: '/v1/auth/password/forgot',
    payload: { email: 'USER@example.com' },
  });
  expect(forgot.statusCode).toBe(202);
  expect(forgot.json()).toEqual({ accepted: true });
  expect(otp.request).toHaveBeenCalledWith('user@example.com', 'password_reset');
  const reset = await server.inject({
    method: 'POST',
    url: '/v1/auth/password/reset',
    payload: { email: 'USER@example.com', code: '123456', newPassword: 'secure replacement' },
  });
  expect(reset.statusCode).toBe(200);
  expect(identity.resetPassword).toHaveBeenCalledWith(
    'user@example.com',
    '123456',
    'secure replacement',
  );
});

it('AUTH-C: me authenticates live session and returns only the strict self projection', async () => {
  const { server, profiles } = await setup();
  const response = await server.inject({
    url: '/v1/me',
    headers: { authorization: 'Bearer token' },
  });
  expect(response.statusCode).toBe(200);
  expect(response.json().user.cnicLast4).toBe('5671');
  expect(response.json().user).not.toHaveProperty('cnic');
  expect(response.headers['cache-control']).toBe('no-store');
  expect(profiles.read).toHaveBeenCalledWith(response.json().user.id);
  expect((await server.inject({ url: '/v1/me' })).statusCode).toBe(401);
});

it('SEC: generated OpenAPI includes strict auth contracts, transport differences and SELF security', async () => {
  const { server } = await setup();
  const response = await server.inject({ url: '/v1/docs-json' });
  expect(response.statusCode).toBe(200);
  const paths = z.object({ paths: z.record(z.unknown()) }).parse(response.json()).paths;
  const post = z.object({
    post: z.object({
      requestBody: z.object({ content: z.record(z.object({ schema: z.unknown() })) }),
      responses: z.record(z.object({ content: z.record(z.object({ schema: z.unknown() })) })),
    }),
  });
  const schema = z.object({
    additionalProperties: z.literal(false),
    required: z.array(z.string()),
    properties: z.record(z.unknown()),
  });
  const login = post.parse(paths['/v1/auth/login']).post;
  const input = schema.parse(login.requestBody.content['application/json']?.schema);
  expect(input.required).toEqual(['identifier', 'password', 'client']);
  expect(login.responses['401']?.content['application/problem+json']).toHaveProperty('schema');
  expect(input.properties.password).toMatchObject({ writeOnly: true, format: 'password' });
  const sessions = z
    .object({ oneOf: z.array(schema) })
    .parse(login.responses['200']?.content['application/json']?.schema);
  expect(sessions.oneOf[0]?.properties).toHaveProperty('accessToken');
  expect(sessions.oneOf[1]?.properties).not.toHaveProperty('accessToken');
  const verification = post.parse(paths['/v1/auth/email/verify']).post;
  const verifyInput = schema.parse(verification.requestBody.content['application/json']?.schema);
  expect(verifyInput.required).toEqual(['email', 'code']);
  expect(verifyInput.properties.client).toMatchObject({ default: 'mobile' });
  const self = z
    .object({ get: z.object({ security: z.array(z.record(z.array(z.string()))) }) })
    .parse(paths['/v1/me']);
  expect(self.get.security).toEqual(expect.arrayContaining([{ bearer: [] }, { cookie: [] }]));
});

it.each([undefined, 'unsupported', '1'])(
  'HMA-015 SEC-001: profile features require explicit compatible-client opt-in (%s)',
  async (version) => {
    const { server, profiles, identity } = await setup();
    const enabled = { ...(await profiles.read()), features: { profileReviews: true } };
    profiles.read.mockResolvedValue(enabled);
    identity.login.mockResolvedValue({ ...credentials, ...enabled });
    const headers = {
      authorization: 'Bearer access',
      ...(version ? { 'x-hsm-profile-reviews': version } : {}),
    };
    const current = await server.inject({ url: '/v1/me', headers });
    expect(current.statusCode).toBe(200);
    expect(current.json().features).toEqual(version === '1' ? enabled.features : undefined);
    if (version !== '1')
      expect(
        selfProfileSchema.omit({ features: true }).strict().safeParse(current.json()).success,
      ).toBe(true);
    const login = await server.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers,
      payload: { identifier: 'user@example.com', password: 'secure password', client: 'mobile' },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().accessToken).toBe('access');
    expect(login.json().features).toEqual(version === '1' ? enabled.features : undefined);
    expect(await profiles.read()).toHaveProperty('features', enabled.features);
  },
);
