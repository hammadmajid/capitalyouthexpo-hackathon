import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApplication } from '../../src/app.js';
import { parseEnvironment } from '../../src/config.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { AuthTransport } from '../../src/auth/transport.js';
import type { SessionService } from '../../src/auth/session.service.js';
import type { InvitationService } from '../../src/management/invitation.service.js';
import { testKeys } from '../keys.js';
vi.setConfig({ testTimeout: 30000 });
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  branchId = randomUUID(),
  assignmentId = randomUUID(),
  key = randomUUID();
const state = {
  id: assignmentId,
  branchId,
  status: 'pending_activation',
  expiresAt: '2026-10-12T00:00:00.000Z',
  acceptance: 'temporary_password',
};
const services = { invite: vi.fn(), reset: vi.fn() };
const scopes = {
  owner: vi.fn(),
  branch: vi.fn(),
  customer: vi.fn(),
  object: vi.fn(),
  admin: vi.fn(),
};
const crypto = new AuthCrypto(testKeys());
const headers = { authorization: 'Bearer access', 'idempotency-key': key };
const credential = { temporaryCredential: { mode: 'auto' as const } };
const routes = [
  [
    'invite',
    '/v1/manage/branches/' + branchId + '/managers',
    { fullName: 'Manager Name', phone: '03001234567', ...credential },
    201,
  ],
  [
    'reset',
    '/v1/manage/branches/' + branchId + '/managers/' + assignmentId + '/reset-temp-password',
    credential,
    200,
  ],
] as const;
let app: NestFastifyApplication;
beforeAll(async () => {
  app = await createApplication(
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
      sessions: { authenticate: async () => actor } as unknown as SessionService,
      transport: new AuthTransport(crypto, false),
      scopes,
    },
    { invitations: services as unknown as InvitationService },
  );
});
beforeEach(() => {
  vi.resetAllMocks();
  scopes.branch.mockResolvedValue(true);
  for (const [operation, , , status] of routes)
    services[operation].mockResolvedValue({ status, body: state, replayed: false });
});
afterAll(async () => {
  await app?.close();
});
it.each(routes)(
  'AUTH-M-001 SEC: %s requires exact Owner branch scope, idempotency key and no-store response',
  async (operation, url, payload, status) => {
    const response = await app.inject({ method: 'POST', url, headers, payload });
    expect(response.statusCode).toBe(status);
    expect(response.json()).toEqual(state);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['idempotency-replayed']).toBe('false');
    expect(scopes.branch).toHaveBeenCalledWith(actor.userId, branchId, true);
    if (operation === 'invite')
      expect(services.invite).toHaveBeenCalledWith(actor, key, branchId, {
        ...payload,
        phone: '+923001234567',
      });
    else expect(services.reset).toHaveBeenCalledWith(actor, key, branchId, assignmentId, payload);
  },
);
it.each(routes)(
  'SEC: %s denies guests and Manager-only or foreign Owner scope',
  async (operation, url, payload) => {
    expect((await app.inject({ method: 'POST', url, payload })).statusCode).toBe(401);
    scopes.branch.mockResolvedValue(false);
    expect((await app.inject({ method: 'POST', url, headers, payload })).statusCode).toBe(403);
    expect(services[operation]).not.toHaveBeenCalled();
  },
);
it.each(routes)(
  'SEC: %s rejects spoofed fields, invalid key and missing cookie CSRF before work',
  async (operation, url, payload) => {
    expect(
      (
        await app.inject({
          method: 'POST',
          url,
          headers,
          payload: { ...payload, userId: randomUUID() },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url,
          headers: { ...headers, 'idempotency-key': 'invalid' },
          payload,
        })
      ).statusCode,
    ).toBe(400);
    const csrf = crypto.digest('refresh', 'csrf'),
      cookie = 'hsm_access=access; hsm_refresh=refresh; hsm_csrf=' + csrf;
    expect(
      (
        await app.inject({
          method: 'POST',
          url,
          headers: { cookie, 'idempotency-key': key },
          payload,
        })
      ).statusCode,
    ).toBe(403);
    expect(services[operation]).not.toHaveBeenCalled();
    expect(
      (
        await app.inject({
          method: 'POST',
          url,
          headers: { cookie, 'idempotency-key': key, 'x-csrf-token': csrf },
          payload,
        })
      ).statusCode,
    ).toBe(operation === 'invite' ? 201 : 200);
  },
);
it('SEC: replay omits credential and is explicitly marked', async () => {
  services.invite.mockResolvedValue({ status: 201, body: state, replayed: true });
  const route = routes[0],
    response = await app.inject({ method: 'POST', url: route[1], headers, payload: route[2] });
  expect(response.headers['idempotency-replayed']).toBe('true');
  expect(response.json()).not.toHaveProperty('generatedTempPassword');
});
it('AUTH-M-001: OpenAPI describes the existing strict auto/manual union and one-time response', async () => {
  const paths = (await app.inject('/v1/docs-json')).json().paths;
  const invitation = paths['/v1/manage/branches/{branchId}/managers'].post;
  expect(invitation.requestBody.content['application/json'].schema.additionalProperties).toBe(
    false,
  );
  expect(invitation.requestBody.content['application/json'].schema.required).toEqual([
    'fullName',
    'phone',
    'temporaryCredential',
  ]);
  expect(
    invitation.responses['201'].content['application/json'].schema.properties.generatedTempPassword,
  ).toBeDefined();
  expect(
    paths['/v1/manage/branches/{branchId}/managers/{assignmentId}/reset-temp-password'].post,
  ).toBeDefined();
});
