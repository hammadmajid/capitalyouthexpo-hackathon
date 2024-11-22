import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterEach, expect, it, vi } from 'vitest';
import { createApplication } from '../../src/app.js';
import { parseEnvironment } from '../../src/config.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { AuthTransport } from '../../src/auth/transport.js';
import type { CustomerProfileService } from '../../src/auth/customer-profile.service.js';
import type { SessionService } from '../../src/auth/session.service.js';
import { testKeys } from '../keys.js';
vi.setConfig({ testTimeout: 30000 });
const crypto = new AuthCrypto(testKeys());
const apps: NestFastifyApplication[] = [];
const body = { fullName: 'Customer Identity', phone: '03001234567', age: 21, gender: 'female' };
async function setup() {
  const actor = { userId: randomUUID(), sessionId: randomUUID() };
  const customer = {
    complete: vi.fn().mockResolvedValue({
      user: {
        id: actor.userId,
        fullName: body.fullName,
        email: 'customer@example.test',
        emailVerified: true,
        cnicLast4: null,
      },
      capabilities: { customer: true, owner: false, managerOf: [], admin: null },
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
      customer: customer as unknown as CustomerProfileService,
    },
  );
  apps.push(app);
  return { server: app.getHttpAdapter().getInstance(), customer, actor };
}
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
it('AUTH-C CHG-006 SEC: Customer completion requires authentication and resolves its actor from the live session', async () => {
  const { server, customer, actor } = await setup();
  expect(
    (await server.inject({ method: 'PUT', url: '/v1/me/customer-profile', payload: body }))
      .statusCode,
  ).toBe(401);
  expect(customer.complete).not.toHaveBeenCalled();
  const response = await server.inject({
    method: 'PUT',
    url: '/v1/me/customer-profile',
    payload: body,
    headers: { authorization: 'Bearer access' },
  });
  expect(response.statusCode).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(customer.complete).toHaveBeenCalledWith(actor, { ...body, phone: '+923001234567' });
  expect(response.json().capabilities.customer).toBe(true);
});
it('SEC AUTH-C: Customer fields reject identity spoofing and removed signup inputs', async () => {
  const { server, customer } = await setup();
  for (const field of ['userId', 'emailVerifiedAt', 'dateOfBirth', 'cnic', 'owner']) {
    const response = await server.inject({
      method: 'PUT',
      url: '/v1/me/customer-profile',
      payload: { ...body, [field]: 'untrusted' },
      headers: { authorization: 'Bearer access' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('VALIDATION_FAILED');
  }
  expect(customer.complete).not.toHaveBeenCalled();
});
it('SEC: cookie-authenticated Customer completion enforces existing refresh-bound CSRF', async () => {
  const { server, customer } = await setup();
  const csrf = crypto.digest('refresh', 'csrf');
  const cookie = 'hsm_access=access; hsm_refresh=refresh; hsm_csrf=' + csrf;
  expect(
    (
      await server.inject({
        method: 'PUT',
        url: '/v1/me/customer-profile',
        payload: body,
        headers: { cookie },
      })
    ).statusCode,
  ).toBe(403);
  expect(customer.complete).not.toHaveBeenCalled();
  expect(
    (
      await server.inject({
        method: 'PUT',
        url: '/v1/me/customer-profile',
        payload: body,
        headers: { cookie, 'x-csrf-token': csrf },
      })
    ).statusCode,
  ).toBe(200);
});
it('AUTH-C CHG-006: OpenAPI exposes editable adult age and omits initial CNIC, DOB and client-supplied email', async () => {
  const { server } = await setup();
  const response = await server.inject({ url: '/v1/docs-json' });
  expect(response.statusCode).toBe(200);
  const schema =
    response.json().paths['/v1/me/customer-profile'].put.requestBody.content['application/json']
      .schema;
  expect(schema.required).toEqual(['fullName', 'phone', 'age', 'gender']);
  expect(schema.properties.age).toEqual({ type: 'integer', minimum: 18, maximum: 120 });
  for (const field of ['dateOfBirth', 'cnic', 'email'])
    expect(schema.properties).not.toHaveProperty(field);
});
