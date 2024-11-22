import { randomBytes, randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterEach, expect, it, vi } from 'vitest';
import { DomainError } from '@hsm/contracts';
import { createApplication } from '../../src/app.js';
import { parseEnvironment } from '../../src/config.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { AuthTransport } from '../../src/auth/transport.js';
import type { RegistrationService } from '../../src/auth/registration.service.js';
import type { SessionService } from '../../src/auth/session.service.js';
import { testKeys } from '../keys.js';
vi.setConfig({ testTimeout: 30000 });
const applications: NestFastifyApplication[] = [];
const crypto = new AuthCrypto(testKeys());
const setupToken = randomBytes(32).toString('base64url');
async function setup() {
  const userId = randomUUID();
  const registration = {
    start: vi.fn().mockResolvedValue({ verificationRequired: true }),
    verify: vi
      .fn<RegistrationService['verify']>()
      .mockResolvedValue({ next: 'password', setupToken, expiresIn: 600 }),
    password: vi.fn().mockImplementation(async (body: { client: 'mobile' | 'web' }) => ({
      client: body.client,
      accessToken: 'access',
      refreshToken: 'refresh',
      sessionId: randomUUID(),
      expiresIn: 600,
      user: {
        id: userId,
        fullName: '',
        email: 'new@example.test',
        emailVerified: true,
        cnicLast4: null,
      },
      capabilities: { customer: false, owner: false, managerOf: [], admin: null },
    })),
  };
  const app = await createApplication(
    parseEnvironment({
      ...testKeys(),
      APP_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: 'postgres://localhost/test',
      REDIS_URL: 'redis://localhost',
      CORS_ORIGINS: 'http://localhost:3000',
    }),
    {
      postgres: async () => undefined,
      redis: async () => undefined,
      increment: async () => 1,
      close: async () => undefined,
    },
    [],
    {
      sessions: {} as SessionService,
      transport: new AuthTransport(crypto, false),
      registration: registration as unknown as RegistrationService,
    },
  );
  applications.push(app);
  return { registration, server: app.getHttpAdapter().getInstance() };
}
afterEach(async () => {
  await Promise.all(applications.splice(0).map((app) => app.close()));
});
it('AUTH-C-001/002: email start and OTP verification never create normal cookies or credentials', async () => {
  const { server, registration } = await setup();
  const start = await server.inject({
    method: 'POST',
    url: '/v1/auth/registration/start',
    payload: { email: 'NEW@example.test' },
  });
  expect(start.statusCode).toBe(202);
  expect(start.json()).toEqual({ verificationRequired: true });
  expect(start.headers['cache-control']).toBe('no-store');
  expect(start.cookies).toHaveLength(0);
  expect(registration.start).toHaveBeenCalledWith({ email: 'new@example.test' });
  const verified = await server.inject({
    method: 'POST',
    url: '/v1/auth/registration/verify',
    payload: { email: 'NEW@example.test', code: '123456' },
  });
  expect(verified.statusCode).toBe(200);
  expect(verified.json()).toEqual({ next: 'password', setupToken, expiresIn: 600 });
  expect(verified.headers['cache-control']).toBe('no-store');
  expect(verified.cookies).toHaveLength(0);
  expect(registration.verify).toHaveBeenCalledWith({ email: 'new@example.test', code: '123456' });
  expect(registration.password).not.toHaveBeenCalled();
});
it('AUTH-C-001 SEC: strict staged inputs reject legacy registration fields and invalid proof', async () => {
  const { server, registration } = await setup();
  for (const [route, payload] of [
    ['start', { email: 'new@example.test', password: 'legacy password' }],
    ['verify', { email: 'new@example.test', code: '123456', client: 'mobile' }],
    ['verify', { email: 'new@example.test', code: 'bad' }],
    ['password', { password: 'secure password', client: 'mobile' }],
    ['password', { setupToken, password: 'secure password', client: 'mobile', isAdmin: true }],
  ] as const) {
    const response = await server.inject({
      method: 'POST',
      url: '/v1/auth/registration/' + route,
      payload,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('VALIDATION_FAILED');
  }
  expect(registration.start).not.toHaveBeenCalled();
  expect(registration.verify).not.toHaveBeenCalled();
  expect(registration.password).not.toHaveBeenCalled();
});
it('AUTH-C-001 SEC: mobile setup returns credentials while web setup uses protected cookies only', async () => {
  const { server, registration } = await setup();
  for (const client of ['mobile', 'web'] as const) {
    const response = await server.inject({
      method: 'POST',
      url: '/v1/auth/registration/password',
      payload: { setupToken, password: 'secure password', client },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json().capabilities.customer).toBe(false);
    expect(registration.password).toHaveBeenLastCalledWith({
      setupToken,
      password: 'secure password',
      client,
    });
    if (client === 'mobile') {
      expect(response.json()).toMatchObject({ accessToken: 'access', refreshToken: 'refresh' });
      expect(response.cookies).toHaveLength(0);
    } else {
      expect(response.json()).not.toHaveProperty('accessToken');
      expect(response.json()).not.toHaveProperty('refreshToken');
      expect(response.cookies).toHaveLength(3);
      expect(response.cookies.find((cookie) => cookie.name === 'hsm_refresh')).toMatchObject({
        httpOnly: true,
        sameSite: 'Lax',
        path: '/',
      });
    }
  }
});
it('AUTH-C-002 SEC: permanent identities receive login continuation and failed grants never set cookies', async () => {
  const { server, registration } = await setup();
  registration.verify.mockResolvedValueOnce({ next: 'login' });
  const verified = await server.inject({
    method: 'POST',
    url: '/v1/auth/registration/verify',
    payload: { email: 'new@example.test', code: '123456' },
  });
  expect(verified.json()).toEqual({ next: 'login' });
  expect(verified.cookies).toHaveLength(0);
  registration.password.mockRejectedValueOnce(
    new DomainError('INVALID_CREDENTIALS', 401, 'Registration setup unavailable'),
  );
  const rejected = await server.inject({
    method: 'POST',
    url: '/v1/auth/registration/password',
    payload: { setupToken, password: 'secure password', client: 'web' },
  });
  expect(rejected.statusCode).toBe(401);
  expect(rejected.cookies).toHaveLength(0);
  expect(rejected.json()).not.toHaveProperty('setupToken');
});
it('AUTH-C-001/002 SEC: generated route metadata documents setup without normal verification credentials', async () => {
  const { server } = await setup();
  const response = await server.inject({ url: '/v1/docs-json' });
  expect(response.statusCode).toBe(200);
  const paths = response.json().paths;
  const start = paths['/v1/auth/registration/start'].post;
  expect(start.requestBody.content['application/json'].schema.required).toEqual(['email']);
  const verify = paths['/v1/auth/registration/verify'].post;
  const variants = verify.responses['200'].content['application/json'].schema.oneOf;
  expect(variants[0].properties).not.toHaveProperty('accessToken');
  expect(variants[1].required).toEqual(['next']);
  const input =
    paths['/v1/auth/registration/password'].post.requestBody.content['application/json'].schema;
  expect(input.required).toEqual(['setupToken', 'password', 'client']);
  expect(input.properties.setupToken.writeOnly).toBe(true);
});
