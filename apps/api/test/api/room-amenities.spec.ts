import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DomainError } from '@hsm/contracts';
import { createApplication } from '../../src/app.js';
import { parseEnvironment } from '../../src/config.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { AuthTransport } from '../../src/auth/transport.js';
import type { SessionService } from '../../src/auth/session.service.js';
import { RoomAmenitiesService } from '../../src/inventory/room-amenities.service.js';
import { RoomAmenitiesRepository } from '../../src/inventory/room-amenities.repository.js';
import { IdempotencyService } from '../../src/idempotency/service.js';
import type { IdempotencyStore, StoredResponse } from '../../src/idempotency/store.js';
import { queryFixture } from '../unit/query-fixture.js';
import { testKeys } from '../keys.js';
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  branchId = randomUUID(),
  roomTypeId = randomUUID(),
  store = queryFixture(),
  rows = new Map<string, StoredResponse>();
const result = { branchId, roomTypeId, version: 'a'.repeat(64), canEdit: true, amenities: [] };
const repository = new RoomAmenitiesRepository(store.database),
  read = vi.spyOn(repository, 'read'),
  save = vi.spyOn(repository, 'save'),
  authorize = vi.spyOn(repository, 'authorize');
const writeStore: IdempotencyStore = {
  transaction: async (_actor, _now, work) =>
    work({
      database: store.transaction,
      read: async (key) => rows.get(key),
      remove: async (key) => {
        rows.delete(key);
      },
      save: async (key, value) => {
        rows.set(key, value);
      },
    }),
};
const service = new RoomAmenitiesService(repository, new IdempotencyService(writeStore));
const scopes = {
  owner: vi.fn(),
  branch: vi.fn(),
  customer: vi.fn(),
  object: vi.fn(),
  admin: vi.fn(),
};
const url = '/v1/branches/' + branchId + '/room-types/' + roomTypeId + '/amenities',
  headers = { authorization: 'Bearer access' },
  body = { amenityCodes: [] };
const writeHeaders = () => ({
  ...headers,
  'Idempotency-Key': randomUUID(),
  'If-Match': '"' + result.version + '"',
});
let application: NestFastifyApplication;
beforeAll(async () => {
  application = await createApplication(
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
    { roomAmenities: service },
  );
});
afterAll(async () => {
  await application?.close();
});
beforeEach(() => {
  vi.clearAllMocks();
  rows.clear();
  scopes.branch.mockResolvedValue(true);
  scopes.owner.mockResolvedValue(true);
  scopes.admin.mockResolvedValue(undefined);
  read.mockResolvedValue(result);
  save.mockResolvedValue(result);
  authorize.mockResolvedValue({
    organizationId: randomUUID(),
    brandId: randomUUID(),
    ownerId: actor.userId,
    actorRole: 'owner',
  });
});
it('ROOM-002 / ACC-004: private reads bind actual branch and room and emit version/no-store', async () => {
  const response = await application.inject({ url, headers });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual(result);
  expect(response.headers.etag).toBe('"' + result.version + '"');
  expect(response.headers['cache-control']).toBe('no-store');
  expect(read).toHaveBeenCalledWith(actor, branchId, roomTypeId);
});
it('ACC-004: read-only capability is not upgraded by the HTTP controller', async () => {
  read.mockResolvedValue({ ...result, canEdit: false });
  expect((await application.inject({ url, headers })).json()).toMatchObject({ canEdit: false });
});
it('SEC-003: anonymous private room reads and writes fail before IO', async () => {
  expect((await application.inject({ url })).statusCode).toBe(401);
  expect((await application.inject({ method: 'PUT', url, payload: body })).statusCode).toBe(401);
  expect(read).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
});
it('ACC-004: guessed foreign branch fails before child reads or writes', async () => {
  scopes.branch.mockResolvedValue(false);
  expect((await application.inject({ url, headers })).statusCode).toBe(403);
  expect(
    (await application.inject({ method: 'PUT', url, headers: writeHeaders(), payload: body }))
      .statusCode,
  ).toBe(403);
  expect(read).not.toHaveBeenCalled();
  expect(authorize).not.toHaveBeenCalled();
});
it('ROOM-002 / AUD-001: exact precondition and scoped idempotent replay reach the service once', async () => {
  const request = { method: 'PUT' as const, url, headers: writeHeaders(), payload: body },
    first = await application.inject(request),
    replay = await application.inject(request);
  expect(first.statusCode).toBe(200);
  expect(first.json()).toEqual(result);
  expect(first.headers.etag).toBe('"' + result.version + '"');
  expect(first.headers['cache-control']).toBe('no-store');
  expect(replay.headers['idempotency-replayed']).toBe('true');
  expect(save).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledWith(
    store.transaction,
    actor,
    branchId,
    roomTypeId,
    result.version,
    body,
  );
  expect(authorize).toHaveBeenCalledTimes(2);
});
it('ROOM-002: stale-version failure remains a typed 412 response', async () => {
  save.mockRejectedValue(new DomainError('PRECONDITION_FAILED', 412, 'Changed'));
  const response = await application.inject({
    method: 'PUT',
    url,
    headers: writeHeaders(),
    payload: body,
  });
  expect(response.statusCode).toBe(412);
  expect(response.json()).toMatchObject({ code: 'PRECONDITION_FAILED', status: 412 });
});
it('ACC-004: current grant revocation denies stored replay before a second save', async () => {
  const request = { method: 'PUT' as const, url, headers: writeHeaders(), payload: body };
  expect((await application.inject(request)).statusCode).toBe(200);
  authorize.mockRejectedValue(new DomainError('FORBIDDEN', 403, 'Revoked'));
  expect((await application.inject(request)).statusCode).toBe(403);
  expect(save).toHaveBeenCalledTimes(1);
});
it('SEC-001: cookie writes without CSRF proof fail before authorization', async () => {
  const response = await application.inject({
    method: 'PUT',
    url,
    headers: {
      cookie: 'hsm_access=access',
      origin: 'http://localhost:3000',
      'Idempotency-Key': randomUUID(),
      'If-Match': '"' + result.version + '"',
    },
    payload: body,
  });
  expect(response.statusCode).toBe(403);
  expect(authorize).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
});
it('ROOM-002 / SEC-003: extra scope, mixed pricing and invalid preconditions fail before repository IO', async () => {
  expect(
    (await application.inject({ url: url + '?customerId=' + actor.userId, headers })).statusCode,
  ).toBe(400);
  expect(
    (
      await application.inject({
        method: 'PUT',
        url,
        headers: writeHeaders(),
        payload: { ...body, depositPaisa: 0 },
      })
    ).statusCode,
  ).toBe(400);
  expect(
    (
      await application.inject({
        method: 'PUT',
        url,
        headers: { ...writeHeaders(), 'If-Match': '*' },
        payload: body,
      })
    ).statusCode,
  ).toBe(400);
  expect(read).not.toHaveBeenCalled();
  expect(authorize).not.toHaveBeenCalled();
});
