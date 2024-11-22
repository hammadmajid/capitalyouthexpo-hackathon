import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DomainError } from '@hsm/contracts';
import { createApplication } from '../../src/app.js';
import { parseEnvironment } from '../../src/config.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { AuthTransport } from '../../src/auth/transport.js';
import type { SessionService } from '../../src/auth/session.service.js';
import type { HostelSetupService } from '../../src/management/hostel-setup.service.js';
import { testKeys } from '../keys.js';
vi.setConfig({ testTimeout: 30000 });
const actor = { userId: randomUUID(), sessionId: randomUUID() };
const organizationId = randomUUID(),
  brandId = randomUUID(),
  key = randomUUID();
const state = {
  id: brandId,
  organizationId,
  mainBranchId: randomUUID(),
  verificationStatus: 'draft',
  missingFields: [],
};
const services = {
  create: vi.fn(),
  basics: vi.fn(),
  main: vi.fn(),
  submit: vi.fn(),
  read: vi.fn(),
  list: vi.fn(),
};
const scopes = {
  owner: vi.fn(),
  branch: vi.fn(),
  customer: vi.fn(),
  object: vi.fn(),
  admin: vi.fn(),
};
const crypto = new AuthCrypto(testKeys());
const headers = { authorization: 'Bearer access', 'idempotency-key': key };
const routes = [
  [
    'create',
    'POST',
    `/v1/owner/organizations/${organizationId}/brands`,
    { name: 'Hostel' },
    organizationId,
    201,
  ],
  ['basics', 'PUT', `/v1/owner/brands/${brandId}/basics`, { name: 'Hostel' }, brandId, 200],
  ['main', 'PUT', `/v1/owner/brands/${brandId}/main-branch`, { name: 'Main branch' }, brandId, 200],
  ['submit', 'POST', `/v1/owner/brands/${brandId}/submit`, {}, brandId, 200],
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
    { hostelSetup: services as unknown as HostelSetupService },
  );
});
beforeEach(() => {
  vi.resetAllMocks();
  scopes.owner.mockResolvedValue(true);
  for (const [operation, , , , , status] of routes)
    services[operation].mockResolvedValue({ status, body: state, replayed: false });
  services.read.mockResolvedValue({ id: brandId, private: 'fresh owner details' });
  services.list.mockResolvedValue({ data: [], nextCursor: null });
});
afterAll(async () => {
  await app?.close();
});
it.each(routes)(
  'OWN-001 SEC: %s is owner-only, validated and no-store with explicit replay status',
  async (operation, method, url, payload, targetId, status) => {
    const response = await app.inject({ method, url, headers, payload });
    expect(response.statusCode).toBe(status);
    expect(response.json()).toEqual(state);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['idempotency-replayed']).toBe('false');
    expect(services[operation]).toHaveBeenCalledWith(actor, key, targetId, payload);
  },
);
it('OWN-001: owner list and fresh setup reads use the caller identity and validated pagination', async () => {
  const list = await app.inject({
    url: `/v1/owner/organizations/${organizationId}/brands?limit=10`,
    headers,
  });
  expect(list.statusCode).toBe(200);
  expect(list.headers['cache-control']).toBe('no-store');
  expect(services.list).toHaveBeenCalledWith(actor, organizationId, { limit: 10 });
  const read = await app.inject({ url: `/v1/owner/brands/${brandId}/onboarding`, headers });
  expect(read.statusCode).toBe(200);
  expect(read.headers['cache-control']).toBe('no-store');
  expect(services.read).toHaveBeenCalledWith(actor, brandId);
});
it('SEC: guest and non-Owner capabilities cannot call setup routes', async () => {
  const requests = [
    ...routes.map(([, method, url, payload]) => ({ method, url, payload })),
    { method: 'GET' as const, url: `/v1/owner/brands/${brandId}/onboarding` },
    { method: 'GET' as const, url: `/v1/owner/organizations/${organizationId}/brands` },
  ];
  for (const request of requests) expect((await app.inject(request)).statusCode).toBe(401);
  scopes.owner.mockResolvedValue(false);
  for (const request of requests)
    expect((await app.inject({ ...request, headers })).statusCode).toBe(403);
  for (const service of Object.values(services)) expect(service).not.toHaveBeenCalled();
});
it('SEC: ownership/approval spoofing and invalid IDs, key or pagination fail before service execution', async () => {
  for (const [, method, url, payload] of routes) {
    expect(
      (
        await app.inject({
          method,
          url,
          headers,
          payload: { ...payload, ownerUserId: actor.userId },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method,
          url,
          headers: { authorization: headers.authorization },
          payload,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method,
          url,
          headers: { ...headers, 'idempotency-key': 'invalid' },
          payload,
        })
      ).statusCode,
    ).toBe(400);
  }
  expect(
    (await app.inject({ url: '/v1/owner/brands/invalid/onboarding', headers })).statusCode,
  ).toBe(400);
  expect(
    (
      await app.inject({
        url: `/v1/owner/organizations/${organizationId}/brands?limit=101`,
        headers,
      })
    ).statusCode,
  ).toBe(400);
  for (const service of Object.values(services)) expect(service).not.toHaveBeenCalled();
});
it('SEC: cookie-authenticated setup mutations retain refresh-bound CSRF protection', async () => {
  const csrf = crypto.digest('refresh', 'csrf'),
    cookie = 'hsm_access=access; hsm_refresh=refresh; hsm_csrf=' + csrf;
  for (const [, method, url, payload, , status] of routes) {
    expect(
      (await app.inject({ method, url, payload, headers: { cookie, 'idempotency-key': key } }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method,
          url,
          payload,
          headers: { cookie, 'idempotency-key': key, 'x-csrf-token': csrf },
        })
      ).statusCode,
    ).toBe(status);
  }
});
it('SEC: foreign scope remains opaque and replay response is explicitly marked', async () => {
  services.read.mockRejectedValueOnce(new DomainError('NOT_FOUND', 404, 'Hostel unavailable'));
  expect(
    (await app.inject({ url: `/v1/owner/brands/${brandId}/onboarding`, headers })).statusCode,
  ).toBe(404);
  services.basics.mockResolvedValueOnce({ status: 200, body: state, replayed: true });
  const response = await app.inject({
    method: 'PUT',
    url: `/v1/owner/brands/${brandId}/basics`,
    headers,
    payload: { name: 'Hostel' },
  });
  expect(response.statusCode).toBe(200);
  expect(response.headers['idempotency-replayed']).toBe('true');
});
it('OWN-001 SEC: OpenAPI documents strict drafts, safe replay and explicit owner setup routes', async () => {
  const response = await app.inject({ url: '/v1/docs-json' });
  const paths = response.json().paths;
  const create = paths['/v1/owner/organizations/{orgId}/brands'].post;
  expect(create.requestBody.content['application/json'].schema.additionalProperties).toBe(false);
  expect(create.requestBody.content['application/json'].schema.required).toEqual(['name']);
  expect(create.responses['201'].content['application/json'].schema.properties).not.toHaveProperty(
    'phone',
  );
  const main = paths['/v1/owner/brands/{brandId}/main-branch'].put;
  expect(
    main.requestBody.content['application/json'].schema.properties.location.properties.latitude
      .maximum,
  ).toBe(90);
  expect(main.requestBody.content['application/json'].schema.properties).not.toHaveProperty(
    'verificationStatus',
  );
  expect(paths['/v1/owner/brands/{brandId}/onboarding'].get).toBeDefined();
});
