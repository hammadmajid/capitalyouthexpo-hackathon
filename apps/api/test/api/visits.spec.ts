import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApplication } from '../../src/app.js';
import { parseEnvironment } from '../../src/config.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { AuthTransport } from '../../src/auth/transport.js';
import type { SessionService } from '../../src/auth/session.service.js';
import { VisitService } from '../../src/visits/service.js';
import { VisitRepository } from '../../src/visits/repository.js';
import { IdempotencyService } from '../../src/idempotency/service.js';
import { IdempotencyRepository } from '../../src/idempotency/repository.js';
import { queryFixture } from '../unit/query-fixture.js';
import { testKeys } from '../keys.js';
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  branchId = randomUUID(),
  visitId = randomUUID();
const query = queryFixture(),
  repository = new VisitRepository(query.database);
const service = new VisitService(
  repository,
  new IdempotencyService(new IdempotencyRepository(query.database)),
);
const scopes = {
  owner: vi.fn(),
  branch: vi.fn(),
  customer: vi.fn(),
  object: vi.fn(),
  admin: vi.fn(),
};
const summary = {
  id: visitId,
  branchId,
  status: 'requested' as const,
  requestedStart: '2026-11-05T05:00:00.000Z',
  proposedStart: null,
  reason: null,
  createdAt: '2026-10-22T05:00:00.000Z',
  updatedAt: '2026-10-22T05:00:00.000Z',
};
const slots = vi.spyOn(service, 'publicHours'),
  list = vi.spyOn(service, 'list'),
  create = vi.spyOn(service, 'create'),
  action = vi.spyOn(service, 'action');
const hours = vi.spyOn(service, 'hours'),
  saveHours = vi.spyOn(service, 'saveHours');
const headers = { authorization: 'Bearer access', 'Idempotency-Key': randomUUID() };
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
    { visits: service },
  );
});
afterAll(async () => {
  await app?.close();
});
beforeEach(() => {
  vi.clearAllMocks();
  scopes.branch.mockResolvedValue(true);
  scopes.customer.mockResolvedValue(true);
  scopes.owner.mockResolvedValue(true);
  scopes.admin.mockResolvedValue(undefined);
  slots.mockResolvedValue({ branchId, date: '2026-11-05', windows: [] });
  list.mockResolvedValue({
    data: [{ ...summary, branchName: 'Hostel', customerName: 'Customer' }],
    nextCursor: null,
  });
  create.mockResolvedValue({ status: 201, body: summary, replayed: false });
  action.mockResolvedValue({ status: 200, body: summary, replayed: false });
  hours.mockResolvedValue({ branchId, version: 'a'.repeat(64), windows: [] });
  saveHours.mockResolvedValue({
    status: 200,
    body: { branchId, version: 'b'.repeat(64), windows: [] },
    replayed: false,
  });
});
it('VISIT-001: public selected-date windows need no customer or branch authority', async () => {
  const response = await app.inject({
    url: '/v1/public/hostels/example/visit-slots?date=2026-11-05',
  });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ branchId, date: '2026-11-05', windows: [] });
  expect(slots).toHaveBeenCalledWith('example', '2026-11-05');
  expect(scopes.branch).not.toHaveBeenCalled();
  expect(scopes.customer).not.toHaveBeenCalled();
  expect(response.headers['cache-control']).toBe('no-store');
});
it('VISIT-001 / ACC-002: denied foreign branch cannot invoke visit service', async () => {
  scopes.branch.mockResolvedValue(false);
  const response = await app.inject({ url: '/v1/branches/' + branchId + '/visits', headers });
  expect(response.statusCode).toBe(403);
  expect(list).not.toHaveBeenCalled();
});
it('VISIT-001 / ACC-003: own listing uses only authenticated actor scope', async () => {
  const response = await app.inject({ url: '/v1/me/visits?limit=1', headers });
  expect(response.statusCode).toBe(200);
  expect(list).toHaveBeenCalledWith(actor, { limit: 1 });
  expect(
    (await app.inject({ url: '/v1/me/visits?customerUserId=' + randomUUID(), headers })).statusCode,
  ).toBe(400);
});
it('VISIT-001: strict create propagates original command key and private response headers', async () => {
  const input = { branchId, requestedStart: summary.requestedStart };
  const response = await app.inject({
    method: 'POST',
    url: '/v1/me/visits',
    headers,
    payload: input,
  });
  expect(response.statusCode).toBe(201);
  expect(create).toHaveBeenCalledWith(actor, headers['Idempotency-Key'], input);
  expect(response.headers['idempotency-replayed']).toBe('false');
  expect(response.headers['cache-control']).toBe('no-store');
});
it('VISIT-001: injected identity or missing reviewed version never reaches mutation', async () => {
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/v1/me/visits',
        headers,
        payload: { branchId, requestedStart: summary.requestedStart, customerUserId: randomUUID() },
      })
    ).statusCode,
  ).toBe(400);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/v1/me/visits/' + visitId + '/actions',
        headers,
        payload: { command: { action: 'accept-reschedule' } },
      })
    ).statusCode,
  ).toBe(400);
  expect(create).not.toHaveBeenCalled();
  expect(action).not.toHaveBeenCalled();
});

it('VISIT-001 / ACC-006: hours reads and writes preserve branch, version and command metadata', async () => {
  const url = '/v1/branches/' + branchId + '/visiting-hours';
  expect((await app.inject({ url, headers })).statusCode).toBe(200);
  expect(hours).toHaveBeenCalledWith(actor, branchId);
  const body = { expectedVersion: 'a'.repeat(64), windows: [] };
  const response = await app.inject({ method: 'PUT', url, headers, payload: body });
  expect(response.statusCode).toBe(200);
  expect(saveHours).toHaveBeenCalledWith(actor, headers['Idempotency-Key'], branchId, body);
  expect(response.headers['cache-control']).toBe('no-store');
});
it.each(['own', 'branch'] as const)(
  'VISIT-001: %s action binds exact authenticated actor, child and reviewed version',
  async (kind) => {
    const own = kind === 'own',
      body = {
        expectedUpdatedAt: summary.updatedAt,
        command: { action: own ? 'cancel' : 'approve' },
      };
    const url = own
      ? '/v1/me/visits/' + visitId + '/actions'
      : '/v1/branches/' + branchId + '/visits/' + visitId + '/actions';
    const response = await app.inject({ method: 'POST', url, headers, payload: body });
    expect(response.statusCode).toBe(200);
    if (own) expect(action).toHaveBeenCalledWith(actor, headers['Idempotency-Key'], visitId, body);
    else
      expect(action).toHaveBeenCalledWith(
        actor,
        headers['Idempotency-Key'],
        visitId,
        body,
        branchId,
      );
  },
);
it('VISIT-001 / SEC-003: cookie requests cannot mutate without matching CSRF proof', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/me/visits',
    headers: { cookie: 'hsm_access=access', 'Idempotency-Key': randomUUID() },
    payload: { branchId, requestedStart: summary.requestedStart },
  });
  expect(response.statusCode).toBe(403);
  expect(create).not.toHaveBeenCalled();
});

it('VISIT-001 / ACC-002: scoped history routes retain actor, child, pagination and branch binding', async () => {
  const history = vi.spyOn(service, 'history').mockResolvedValue({
    visitId,
    branchId,
    branchName: 'Real hostel',
    customerName: 'Customer',
    data: [],
    nextCursor: null,
  });
  const own = await app.inject({
    method: 'GET',
    url: '/v1/me/visits/' + visitId + '/history',
    headers,
  });
  expect(own.statusCode).toBe(200);
  expect(history).toHaveBeenLastCalledWith(actor, visitId, { limit: 20 });
  const branch = await app.inject({
    method: 'GET',
    url: '/v1/branches/' + branchId + '/visits/' + visitId + '/history?limit=1',
    headers,
  });
  expect(branch.statusCode).toBe(200);
  expect(history).toHaveBeenLastCalledWith(actor, visitId, { limit: 1 }, branchId);
  scopes.branch.mockResolvedValue(false);
  const denied = await app.inject({
    method: 'GET',
    url: '/v1/branches/' + branchId + '/visits/' + visitId + '/history',
    headers,
  });
  expect(denied.statusCode).toBe(403);
  expect(history).toHaveBeenCalledTimes(2);
});

it('VISIT-001 / SEC-003: interest reads and explicit customer writes retain strict scope and boundary checks', async () => {
  const result = {
    visitId,
    branchId,
    expectedUpdatedAt: summary.updatedAt,
    promptedAt: null,
    stillInterested: false,
    respondedAt: summary.updatedAt,
  };
  const read = vi.spyOn(service, 'interest').mockResolvedValue(result);
  const record = vi
    .spyOn(service, 'recordInterest')
    .mockResolvedValue({ status: 200, body: result, replayed: false });
  const own = '/v1/me/visits/' + visitId + '/interest',
    branch = '/v1/branches/' + branchId + '/visits/' + visitId + '/interest';
  expect((await app.inject({ method: 'GET', url: own, headers })).statusCode).toBe(200);
  expect(read).toHaveBeenLastCalledWith(actor, visitId);
  expect((await app.inject({ method: 'GET', url: branch, headers })).statusCode).toBe(200);
  expect(read).toHaveBeenLastCalledWith(actor, visitId, branchId);
  const input = { expectedUpdatedAt: summary.updatedAt, stillInterested: false };
  expect((await app.inject({ method: 'POST', url: own, headers, payload: input })).statusCode).toBe(
    200,
  );
  expect(record).toHaveBeenLastCalledWith(actor, headers['Idempotency-Key'], visitId, input);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: own,
        headers,
        payload: { ...input, stillInterested: 'false' },
      })
    ).statusCode,
  ).toBe(400);
  expect(
    (await app.inject({ method: 'POST', url: branch, headers, payload: input })).statusCode,
  ).toBe(404);
  expect(record).toHaveBeenCalledTimes(1);
});
