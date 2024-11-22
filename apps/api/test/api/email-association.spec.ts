import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApplication } from '../../src/app.js';
import { parseEnvironment } from '../../src/config.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { AuthTransport } from '../../src/auth/transport.js';
import type { EmailAssociationService } from '../../src/auth/email-association.service.js';
import type { SessionService } from '../../src/auth/session.service.js';
import { testKeys } from '../keys.js';
vi.setConfig({ testTimeout: 30000 });
const crypto = new AuthCrypto(testKeys());
const apps: NestFastifyApplication[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
async function setup() {
  const actor = { userId: randomUUID(), sessionId: randomUUID() };
  const profile = {
    user: {
      id: actor.userId,
      fullName: 'Manager',
      email: 'manager@example.test',
      emailVerified: true,
      cnicLast4: null,
    },
    capabilities: {
      customer: false,
      owner: false,
      managerOf: [{ branchId: randomUUID(), branchName: 'Original branch' }],
      admin: null,
    },
  };
  const emailAssociation = {
    request: vi.fn().mockResolvedValue({ accepted: true }),
    verify: vi.fn().mockResolvedValue(profile),
  };
  const sessions = { authenticate: vi.fn().mockResolvedValue(actor) };
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
      profiles: { read: async () => profile },
      transport: new AuthTransport(crypto, false),
      emailAssociation: emailAssociation as unknown as EmailAssociationService,
    },
  );
  apps.push(app);
  return { app, actor, emailAssociation, profile };
}
const request = { email: 'MANAGER@example.test', currentPassword: 'Permanent manager phrase' };
it('AUTH-M CHG-006: authenticated association routes normalize strict input, dispatch the live actor and mint no credentials', async () => {
  const { app, actor, emailAssociation, profile } = await setup();
  const headers = { authorization: 'Bearer access' };
  const ack = await app.inject({
    method: 'POST',
    url: '/v1/auth/email/associate',
    headers,
    payload: request,
  });
  expect(ack.statusCode).toBe(202);
  expect(ack.json()).toEqual({ accepted: true });
  expect(emailAssociation.request).toHaveBeenCalledWith(actor, {
    ...request,
    email: 'manager@example.test',
  });
  const result = await app.inject({
    method: 'POST',
    url: '/v1/auth/email/associate/verify',
    headers,
    payload: { email: request.email, code: '123456' },
  });
  expect(result.statusCode).toBe(200);
  expect(result.json()).toEqual(profile);
  expect(emailAssociation.verify).toHaveBeenCalledWith(actor, {
    email: 'manager@example.test',
    code: '123456',
  });
  for (const response of [ack, result]) {
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.json()).not.toHaveProperty('accessToken');
  }
});
it('SEC: missing credentials and caller identity spoofing never reach the association service', async () => {
  const { app, emailAssociation } = await setup();
  expect(
    (await app.inject({ method: 'POST', url: '/v1/auth/email/associate', payload: request }))
      .statusCode,
  ).toBe(401);
  for (const suffix of ['', '/verify']) {
    const payload = suffix
      ? { email: request.email, code: '123456', userId: randomUUID() }
      : { ...request, userId: randomUUID() };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/auth/email/associate' + suffix,
          headers: { authorization: 'Bearer access' },
          payload,
        })
      ).statusCode,
    ).toBe(400);
  }
  expect(emailAssociation.request).not.toHaveBeenCalled();
  expect(emailAssociation.verify).not.toHaveBeenCalled();
});
it('SEC: both cookie-authenticated association mutations enforce refresh-bound CSRF', async () => {
  const { app, emailAssociation } = await setup();
  const csrf = crypto.digest('refresh', 'csrf'),
    cookie = 'hsm_access=access; hsm_refresh=refresh; hsm_csrf=' + csrf;
  for (const suffix of ['', '/verify']) {
    const payload = suffix ? { email: request.email, code: '123456' } : request;
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/auth/email/associate' + suffix,
          headers: { cookie },
          payload,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/auth/email/associate' + suffix,
          headers: { cookie, 'x-csrf-token': csrf },
          payload,
        })
      ).statusCode,
    ).toBe(suffix ? 200 : 202);
  }
  expect(emailAssociation.request).toHaveBeenCalledTimes(1);
  expect(emailAssociation.verify).toHaveBeenCalledTimes(1);
});
