import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApplication } from '../../src/app.js';
import { parseEnvironment } from '../../src/config.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { AuthTransport } from '../../src/auth/transport.js';
import type { SessionService } from '../../src/auth/session.service.js';
import type { HostelSetupService } from '../../src/management/hostel-setup.service.js';
import { testKeys } from '../keys.js';
vi.setConfig({ testTimeout: 30000 });
const actor = { userId: randomUUID(), sessionId: randomUUID() };
const brandId = randomUUID(),
  branchId = randomUUID(),
  key = randomUUID();
const state = {
  id: brandId,
  organizationId: randomUUID(),
  mainBranchId: branchId,
  verificationStatus: 'draft',
  missingFields: [],
};
const services = {
  addBranch: vi.fn(),
  saveBranch: vi.fn(),
  submitBranch: vi.fn(),
  readBranch: vi.fn(),
};
const scopes = {
  owner: vi.fn(),
  branch: vi.fn(),
  customer: vi.fn(),
  object: vi.fn(),
  admin: vi.fn(),
};
const headers = { authorization: 'Bearer access', 'idempotency-key': key };
const base = `/v1/owner/brands/${brandId}/branches`;
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
      transport: new AuthTransport(new AuthCrypto(testKeys()), false),
      scopes,
    },
    { hostelSetup: services as unknown as HostelSetupService },
  );
});
beforeEach(() => {
  vi.resetAllMocks();
  scopes.owner.mockResolvedValue(true);
  services.addBranch.mockResolvedValue({ status: 201, body: state, replayed: false });
  services.saveBranch.mockResolvedValue({ status: 200, body: state, replayed: false });
  services.submitBranch.mockResolvedValue({ status: 200, body: state, replayed: false });
  services.readBranch.mockResolvedValue({ id: brandId });
});
afterAll(async () => {
  await app?.close();
});
it('BRN-001: add, save and submit a branch call the service with the exact hostel and branch', async () => {
  const add = await app.inject({ method: 'POST', url: base, headers, payload: { name: 'G-10' } });
  expect(add.statusCode).toBe(201);
  expect(add.headers['cache-control']).toBe('no-store');
  expect(services.addBranch).toHaveBeenCalledWith(actor, key, brandId, { name: 'G-10' });
  const save = await app.inject({
    method: 'PUT',
    url: `${base}/${branchId}`,
    headers,
    payload: { name: 'G-10' },
  });
  expect(save.statusCode).toBe(200);
  expect(services.saveBranch).toHaveBeenCalledWith(actor, key, brandId, branchId, {
    name: 'G-10',
  });
  const submit = await app.inject({
    method: 'POST',
    url: `${base}/${branchId}/submit`,
    headers,
    payload: {},
  });
  expect(submit.statusCode).toBe(200);
  expect(services.submitBranch).toHaveBeenCalledWith(actor, key, brandId, branchId, {});
  const read = await app.inject({ url: `${base}/${branchId}/onboarding`, headers });
  expect(read.statusCode).toBe(200);
  expect(read.headers['cache-control']).toBe('no-store');
  expect(services.readBranch).toHaveBeenCalledWith(actor, brandId, branchId);
});
it('BRN-001 SEC: guests and non-Owners cannot reach branch setup; spoofed fields are rejected', async () => {
  const requests = [
    { method: 'POST' as const, url: base, payload: { name: 'G-10' } },
    { method: 'PUT' as const, url: `${base}/${branchId}`, payload: { name: 'G-10' } },
    { method: 'POST' as const, url: `${base}/${branchId}/submit`, payload: {} },
    { method: 'GET' as const, url: `${base}/${branchId}/onboarding` },
  ];
  for (const request of requests) expect((await app.inject(request)).statusCode).toBe(401);
  scopes.owner.mockResolvedValue(false);
  for (const request of requests)
    expect((await app.inject({ ...request, headers })).statusCode).toBe(403);
  scopes.owner.mockResolvedValue(true);
  for (const payload of [
    { name: 'G-10', isPrimary: true },
    { name: 'G-10', verificationStatus: 'approved' },
  ])
    expect((await app.inject({ method: 'POST', url: base, headers, payload })).statusCode).toBe(
      400,
    );
  expect(
    (
      await app.inject({
        method: 'PUT',
        url: `${base}/not-a-uuid`,
        headers,
        payload: { name: 'G-10' },
      })
    ).statusCode,
  ).toBe(400);
  for (const service of Object.values(services)) expect(service).not.toHaveBeenCalled();
});
