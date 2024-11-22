import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterEach, expect, it, vi } from 'vitest';
import { createApplication } from '../../src/app.js';
import { parseEnvironment } from '../../src/config.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { AuthTransport } from '../../src/auth/transport.js';
import type { ManagerAcceptanceService } from '../../src/auth/manager-acceptance.service.js';
import type { SessionService } from '../../src/auth/session.service.js';
import { testKeys } from '../keys.js';
vi.setConfig({ testTimeout: 30000 });
const crypto = new AuthCrypto(testKeys()),
  apps: NestFastifyApplication[] = [];
const url = '/v1/me/manager-invitations/accept';
async function setup() {
  const actor = { userId: randomUUID(), sessionId: randomUUID() };
  const acceptance = {
    accept: vi.fn().mockResolvedValue({
      user: {
        id: actor.userId,
        fullName: 'Existing user',
        email: 'verified@example.test',
        emailVerified: true,
        cnicLast4: null,
      },
      capabilities: {
        customer: true,
        owner: false,
        managerOf: [{ branchId: randomUUID(), branchName: 'Assigned branch' }],
        admin: null,
      },
    }),
  };
  const sessions = { authenticate: vi.fn().mockResolvedValue(actor) };
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
      sessions: sessions as unknown as SessionService,
      transport: new AuthTransport(crypto, false),
      managerAcceptance: acceptance as unknown as ManagerAcceptanceService,
    },
  );
  apps.push(app);
  return { server: app.getHttpAdapter().getInstance(), acceptance, actor };
}
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
it('AUTH-M CHG-006 SEC: own authenticated invitation acceptance returns a fresh safe profile without issuing credentials', async () => {
  const { server, acceptance, actor } = await setup();
  expect((await server.inject({ method: 'POST', url, payload: {} })).statusCode).toBe(401);
  expect(acceptance.accept).not.toHaveBeenCalled();
  const result = await server.inject({
    method: 'POST',
    url,
    payload: {},
    headers: { authorization: 'Bearer access' },
  });
  expect(result.statusCode).toBe(200);
  expect(result.headers['cache-control']).toBe('no-store');
  expect(acceptance.accept).toHaveBeenCalledWith(actor);
  expect(result.json().capabilities.customer).toBe(true);
  expect(result.json().capabilities.managerOf).toHaveLength(1);
  expect(result.json()).not.toHaveProperty('accessToken');
  expect(result.headers['set-cookie']).toBeUndefined();
});
it('SEC: acceptance cannot choose a foreign identity, branch, invitation or password', async () => {
  const { server, acceptance } = await setup();
  for (const body of [
    { userId: randomUUID() },
    { branchId: randomUUID() },
    { assignmentId: randomUUID() },
    { newPassword: 'Do not replace identity' },
    { tempPassword: 'No credential needed' },
  ])
    expect(
      (
        await server.inject({
          method: 'POST',
          url,
          payload: body,
          headers: { authorization: 'Bearer access' },
        })
      ).statusCode,
    ).toBe(400);
  expect(acceptance.accept).not.toHaveBeenCalled();
});
it('SEC: cookie acceptance requires the existing refresh-bound CSRF token', async () => {
  const { server, acceptance } = await setup();
  const csrf = crypto.digest('refresh', 'csrf'),
    cookie = 'hsm_access=access; hsm_refresh=refresh; hsm_csrf=' + csrf;
  expect(
    (await server.inject({ method: 'POST', url, payload: {}, headers: { cookie } })).statusCode,
  ).toBe(403);
  expect(acceptance.accept).not.toHaveBeenCalled();
  expect(
    (
      await server.inject({
        method: 'POST',
        url,
        payload: {},
        headers: { cookie, 'x-csrf-token': csrf },
      })
    ).statusCode,
  ).toBe(200);
});
it('AUTH-M: generated metadata declares SELF transport and a strict empty acceptance body', async () => {
  const { server } = await setup();
  const response = await server.inject({ url: '/v1/docs-json' });
  const endpoint = response.json().paths[url].post;
  expect(endpoint.requestBody.content['application/json'].schema).toMatchObject({
    type: 'object',
    additionalProperties: false,
    properties: {},
  });
  expect(endpoint.security).toEqual(expect.arrayContaining([{ bearer: [] }, { cookie: [] }]));
});
