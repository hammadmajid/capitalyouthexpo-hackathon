import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterEach, expect, it, vi } from 'vitest';
import { createApplication } from '../../src/app.js';
import { parseEnvironment } from '../../src/config.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { AuthTransport } from '../../src/auth/transport.js';
import type { OwnerProfileService } from '../../src/auth/owner-profile.service.js';
import type { SessionService } from '../../src/auth/session.service.js';
import { testKeys } from '../keys.js';
vi.setConfig({ testTimeout: 30000 });
const crypto = new AuthCrypto(testKeys());
const apps: NestFastifyApplication[] = [];
const body = {
  fullName: 'Owner Identity',
  phone: '03001234567',
  cnic: '35202-1234567-1',
  cnicFrontFileId: randomUUID(),
  cnicBackFileId: randomUUID(),
  address: 'Verified owner address',
  agreementAccepted: true,
  agreementVersion: 'owner-foundation-v1',
};
async function setup() {
  const actor = { userId: randomUUID(), sessionId: randomUUID() };
  const owner = {
    complete: vi.fn().mockResolvedValue({
      user: {
        id: actor.userId,
        fullName: body.fullName,
        email: 'owner@example.test',
        emailVerified: true,
        cnicLast4: '5671',
      },
      capabilities: { customer: true, owner: true, managerOf: [], admin: null },
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
      owner: owner as unknown as OwnerProfileService,
    },
  );
  apps.push(app);
  return { server: app.getHttpAdapter().getInstance(), owner, actor };
}
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
it('OWN-001 SEC: Owner completion is SELF-scoped and never accepts caller identity or organization ownership', async () => {
  const { server, owner, actor } = await setup();
  expect(
    (await server.inject({ method: 'PUT', url: '/v1/me/owner-profile', payload: body })).statusCode,
  ).toBe(401);
  expect(owner.complete).not.toHaveBeenCalled();
  const response = await server.inject({
    method: 'PUT',
    url: '/v1/me/owner-profile',
    payload: body,
    headers: { authorization: 'Bearer access' },
  });
  expect(response.statusCode).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(owner.complete).toHaveBeenCalledWith(actor, {
    ...body,
    phone: '+923001234567',
    cnic: '3520212345671',
  });
  expect(response.json().capabilities).toMatchObject({ customer: true, owner: true });
  expect(response.json().user).not.toHaveProperty('cnic');
});
it('OWN-001 SEC: Owner contract rejects invalid agreement, repeated document sides and spoofed ownership before service execution', async () => {
  const { server, owner } = await setup();
  for (const patch of [
    { agreementAccepted: false },
    { agreementVersion: 'unknown' },
    { cnicBackFileId: body.cnicFrontFileId },
    { userId: randomUUID() },
    { organizationId: randomUUID() },
    { phoneVerifiedAt: new Date().toISOString() },
    { bankAccount: 'untrusted' },
  ]) {
    const response = await server.inject({
      method: 'PUT',
      url: '/v1/me/owner-profile',
      payload: { ...body, ...patch },
      headers: { authorization: 'Bearer access' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('VALIDATION_FAILED');
  }
  expect(owner.complete).not.toHaveBeenCalled();
});
it('SEC: cookie-authenticated Owner completion uses the existing refresh-bound CSRF behavior', async () => {
  const { server, owner } = await setup();
  const csrf = crypto.digest('refresh', 'csrf');
  const cookie = 'hsm_access=access; hsm_refresh=refresh; hsm_csrf=' + csrf;
  expect(
    (
      await server.inject({
        method: 'PUT',
        url: '/v1/me/owner-profile',
        payload: body,
        headers: { cookie },
      })
    ).statusCode,
  ).toBe(403);
  expect(owner.complete).not.toHaveBeenCalled();
  expect(
    (
      await server.inject({
        method: 'PUT',
        url: '/v1/me/owner-profile',
        payload: body,
        headers: { cookie, 'x-csrf-token': csrf },
      })
    ).statusCode,
  ).toBe(200);
});
it('OWN-001: generated OpenAPI documents the approved agreement and private CNIC evidence contract', async () => {
  const { server } = await setup();
  const response = await server.inject({ url: '/v1/docs-json' });
  expect(response.statusCode).toBe(200);
  const schema =
    response.json().paths['/v1/me/owner-profile'].put.requestBody.content['application/json']
      .schema;
  expect(schema.additionalProperties).toBe(false);
  // CNIC photos are optional evidence (contract `ownerProfileInputSchema`); still documented.
  expect(schema.required).toEqual([
    'fullName',
    'phone',
    'cnic',
    'address',
    'agreementAccepted',
    'agreementVersion',
  ]);
  expect(schema.properties).toHaveProperty('cnicFrontFileId');
  expect(schema.properties).toHaveProperty('cnicBackFileId');
  expect(schema.properties.cnic.writeOnly).toBe(true);
  expect(schema.properties.agreementAccepted.enum).toEqual([true]);
  expect(schema.properties.agreementVersion.enum).toEqual(['owner-foundation-v1']);
  for (const field of ['email', 'bankAccount', 'phoneVerifiedAt', 'organizationId'])
    expect(schema.properties).not.toHaveProperty(field);
});
