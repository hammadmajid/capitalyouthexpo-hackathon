import { testKeys } from '../keys.js';
import { Controller, Get } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { randomBytes } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { createApplication } from '../../src/app.js';
import { Self } from '../../src/access.js';
import { parseEnvironment } from '../../src/config.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { AuthTransport } from '../../src/auth/transport.js';
import type { SessionService } from '../../src/auth/session.service.js';
// Real Nest/Fastify bootstrap can exceed five seconds on Windows under coverage.
vi.setConfig({ testTimeout: 30000 });
const crypto = new AuthCrypto({
  JWT_SECRET: randomBytes(48).toString('hex'),
  CNIC_HASH_KEY: randomBytes(32).toString('hex'),
  CNIC_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
});
const credentials = {
  accessToken: 'access',
  refreshToken: 'r'.repeat(48),
  expiresIn: 600,
  sessionId: 'session',
  client: 'web' as 'web' | 'mobile',
};
@Controller('self-probe')
class Probe {
  @Self() @Get() read() {
    return { ok: true };
  }
}
const applications: NestFastifyApplication[] = [];
async function setup() {
  const sessions = {
    refresh: vi.fn().mockResolvedValue(credentials),
    authenticate: vi.fn().mockResolvedValue({ userId: 'user', sessionId: 'session' }),
    logout: vi.fn().mockResolvedValue(undefined),
    changePassword: vi.fn().mockResolvedValue(undefined),
  };
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
    [Probe],
    {
      sessions: sessions as unknown as SessionService,
      transport: new AuthTransport(crypto, false),
    },
  );
  applications.push(app);
  return { server: app.getHttpAdapter().getInstance(), sessions };
}
afterEach(async () => {
  await Promise.all(applications.splice(0).map((app) => app.close()));
});
it('SEC: web refresh requires CSRF and writes cookies without returning credentials', async () => {
  const { server, sessions } = await setup();
  const csrf = crypto.digest('refresh', 'csrf');
  const cookie = 'hsm_refresh=refresh; hsm_csrf=' + csrf;
  expect(
    (
      await server.inject({
        method: 'POST',
        url: '/v1/auth/refresh',
        payload: {},
        headers: { cookie },
      })
    ).statusCode,
  ).toBe(403);
  expect(sessions.refresh).not.toHaveBeenCalled();
  const response = await server.inject({
    method: 'POST',
    url: '/v1/auth/refresh',
    payload: {},
    headers: { cookie, 'x-csrf-token': csrf },
  });
  expect(response.statusCode).toBe(200);
  expect(response.json()).not.toHaveProperty('accessToken');
  expect(response.headers['set-cookie']).toHaveLength(3);
  expect(sessions.refresh).toHaveBeenCalledWith('refresh', 'web');
});
it('SEC: mobile refresh uses the explicit body and rejects mixed credential sources', async () => {
  const { server, sessions } = await setup();
  sessions.refresh.mockResolvedValue({ ...credentials, client: 'mobile' });
  const response = await server.inject({
    method: 'POST',
    url: '/v1/auth/refresh',
    payload: { refreshToken: credentials.refreshToken },
  });
  expect(response.statusCode).toBe(200);
  expect(response.json().refreshToken).toBe(credentials.refreshToken);
  expect(response.headers['set-cookie']).toBeUndefined();
  expect(sessions.refresh).toHaveBeenCalledWith(credentials.refreshToken, 'mobile');
  for (const headers of [{ cookie: 'unrelated=value' }, { authorization: 'Bearer token' }]) {
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/v1/auth/refresh',
          payload: { refreshToken: credentials.refreshToken },
          headers,
        })
      ).statusCode,
    ).toBe(401);
  }
  expect(
    (
      await server.inject({
        method: 'POST',
        url: '/v1/auth/refresh',
        payload: { refreshToken: 'short' },
      })
    ).statusCode,
  ).toBe(400);
});
it('SEC: protected routes check the live session and logout revokes the chosen scope', async () => {
  const { server, sessions } = await setup();
  const headers = { authorization: 'Bearer token' };
  expect((await server.inject({ url: '/v1/self-probe', headers })).statusCode).toBe(200);
  expect(sessions.authenticate).toHaveBeenCalledWith('token');
  for (const [route, all] of [
    ['logout', false],
    ['logout-all', true],
  ] as const) {
    const response = await server.inject({ method: 'POST', url: '/v1/auth/' + route, headers });
    expect(response.statusCode).toBe(200);
    expect(sessions.logout).toHaveBeenLastCalledWith('user', 'session', all);
    expect(response.headers['set-cookie']).toHaveLength(3);
  }
  expect((await server.inject({ url: '/v1/self-probe' })).statusCode).toBe(401);
});

it('SEC: password change is SELF scoped with strict inputs and no-store responses', async () => {
  const { server, sessions } = await setup();
  const headers = { authorization: 'Bearer token' };
  const payload = {
    currentPassword: 'Current password phrase',
    newPassword: 'Replacement password phrase',
  };
  expect(
    (await server.inject({ method: 'POST', url: '/v1/auth/password/change', payload })).statusCode,
  ).toBe(401);
  expect(
    (
      await server.inject({
        method: 'POST',
        url: '/v1/auth/password/change',
        headers,
        payload: { ...payload, userId: 'foreign' },
      })
    ).statusCode,
  ).toBe(400);
  const response = await server.inject({
    method: 'POST',
    url: '/v1/auth/password/change',
    headers,
    payload,
  });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ changed: true });
  expect(response.headers['cache-control']).toBe('no-store');
  expect(sessions.changePassword).toHaveBeenCalledWith(
    'user',
    'session',
    payload.currentPassword,
    payload.newPassword,
  );
});
