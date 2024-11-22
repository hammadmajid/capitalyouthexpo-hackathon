import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DomainError } from '@hsm/contracts';
import { createApplication } from '../../src/app.js';
import { parseEnvironment } from '../../src/config.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { AuthTransport } from '../../src/auth/transport.js';
import type { SessionService } from '../../src/auth/session.service.js';
import { ListingService } from '../../src/inventory/listing.service.js';
import { ListingRepository } from '../../src/inventory/listing.repository.js';
import { projectListing } from '../../src/inventory/listing-state.js';
import { IdempotencyService } from '../../src/idempotency/service.js';
import type { IdempotencyStore, StoredResponse } from '../../src/idempotency/store.js';
import { queryFixture } from '../unit/query-fixture.js';
import { testKeys } from '../keys.js';
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  branchId = randomUUID(),
  store = queryFixture(),
  rows = new Map<string, StoredResponse>();
const fields = {
  description: null,
  nearbyLandmark: null,
  publicPhone: null,
  publicEmail: null,
  showPublicContact: false,
};
const before = projectListing(branchId, { fields, selected: [] }, true),
  after = projectListing(
    branchId,
    { fields: { ...fields, description: 'Updated' }, selected: [] },
    true,
  );
const repository = new ListingRepository(store.database),
  read = vi.spyOn(repository, 'read'),
  save = vi.spyOn(repository, 'save'),
  authorize = vi.spyOn(repository, 'authorize'),
  catalog = vi.spyOn(repository, 'catalog');
const transaction = vi.fn();
const writeStore: IdempotencyStore = {
  transaction: async (_actor, _now, work) => {
    transaction();
    return work({
      database: store.transaction,
      read: async (key) => rows.get(key),
      remove: async (key) => {
        rows.delete(key);
      },
      save: async (key, value) => {
        rows.set(key, value);
      },
    });
  },
};
const service = new ListingService(repository, new IdempotencyService(writeStore));
const scopes = {
  owner: vi.fn(),
  branch: vi.fn(),
  customer: vi.fn(),
  object: vi.fn(),
  admin: vi.fn(),
};
const url = `/v1/branches/${branchId}/listing`,
  headers = { authorization: 'Bearer access' },
  body = { ...fields, description: 'Updated', amenityCodes: [] };
const writeHeaders = () => ({
  ...headers,
  'Idempotency-Key': randomUUID(),
  'If-Match': '"' + before.version + '"',
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
    { listingSettings: service },
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
  read.mockResolvedValue(before);
  save.mockResolvedValue(after);
  authorize.mockResolvedValue({
    organizationId: randomUUID(),
    brandId: randomUUID(),
    ownerId: actor.userId,
    actorRole: 'owner',
  });
  catalog.mockResolvedValue({ data: [{ code: 'wifi', name: 'Wi-Fi' }], nextCursor: null });
});
it('ACC-004: authenticated private reads return exact current settings, no-store and their quoted ETag', async () => {
  const response = await application.inject({ url, headers });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual(before);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers.etag).toBe('"' + before.version + '"');
  expect(read).toHaveBeenCalledWith(actor, branchId);
  expect(transaction).not.toHaveBeenCalled();
});
it('ACC-004: read-only scope metadata does not become edit permission in the controller', async () => {
  read.mockResolvedValue({ ...before, canEdit: false });
  const response = await application.inject({ url, headers });
  expect(response.json()).toMatchObject({ canEdit: false });
});
it('SEC-003: anonymous listing reads and writes fail before private repository calls', async () => {
  expect((await application.inject({ url })).statusCode).toBe(401);
  expect((await application.inject({ method: 'PUT', url, payload: body })).statusCode).toBe(401);
  expect(read).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
});
it('ACC-004: guessed branch membership is denied on read and write', async () => {
  scopes.branch.mockResolvedValue(false);
  expect((await application.inject({ url, headers })).statusCode).toBe(403);
  expect(
    (await application.inject({ method: 'PUT', url, headers: writeHeaders(), payload: body }))
      .statusCode,
  ).toBe(403);
  expect(read).not.toHaveBeenCalled();
  expect(authorize).not.toHaveBeenCalled();
});
it('TRUST-006 / SEC-003: guarded writes pass exact If-Match and retain idempotent replay', async () => {
  const request = { method: 'PUT' as const, url, headers: writeHeaders(), payload: body };
  const response = await application.inject(request),
    replay = await application.inject(request);
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual(after);
  expect(response.headers.etag).toBe('"' + after.version + '"');
  expect(response.headers['cache-control']).toBe('no-store');
  expect(replay.headers['idempotency-replayed']).toBe('true');
  expect(save).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledWith(store.transaction, actor, branchId, before.version, body);
  expect(authorize).toHaveBeenCalledTimes(2);
});
it('TRUST-006: changed settings remain a sanitized typed 412 problem', async () => {
  save.mockRejectedValue(new DomainError('PRECONDITION_FAILED', 412, 'Refresh current settings'));
  const response = await application.inject({
    method: 'PUT',
    url,
    headers: writeHeaders(),
    payload: body,
  });
  expect(response.statusCode).toBe(412);
  expect(response.json()).toMatchObject({ code: 'PRECONDITION_FAILED', status: 412 });
  expect(rows.size).toBe(0);
});
it('ACC-004: a revoked listing grant still denies replay of a successful write', async () => {
  const request = { method: 'PUT' as const, url, headers: writeHeaders(), payload: body };
  expect((await application.inject(request)).statusCode).toBe(200);
  authorize.mockRejectedValue(new DomainError('FORBIDDEN', 403, 'Revoked'));
  expect((await application.inject(request)).statusCode).toBe(403);
  expect(save).toHaveBeenCalledTimes(1);
});
it.each([{ header: undefined }, { header: '*' }, { header: '"short"' }])(
  'TRUST-006: missing or malformed preconditions cannot authorize writes (%j)',
  async ({ header }) => {
    const original = writeHeaders();
    const response = await application.inject({
      method: 'PUT',
      url,
      headers: {
        authorization: original.authorization,
        'Idempotency-Key': original['Idempotency-Key'],
        ...(header ? { 'If-Match': header } : {}),
      },
      payload: body,
    });
    expect(response.statusCode).toBe(400);
    expect(authorize).not.toHaveBeenCalled();
  },
);
it('SEC-003: raw scope and major profile changes cannot enter the minor listing write', async () => {
  expect(
    (await application.inject({ url: url + '?customerId=' + actor.userId, headers })).statusCode,
  ).toBe(400);
  expect(
    (
      await application.inject({
        method: 'PUT',
        url,
        headers: writeHeaders(),
        payload: { ...body, category: 'girls' },
      })
    ).statusCode,
  ).toBe(400);
  expect(read).not.toHaveBeenCalled();
  expect(authorize).not.toHaveBeenCalled();
});
it('ACC-002: the public approved-amenity catalog resolves the static route without a session or private branch scope', async () => {
  const response = await application.inject({
    url: '/v1/marketplace/amenities?cursor=mess&limit=10',
  });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ data: [{ code: 'wifi', name: 'Wi-Fi' }], nextCursor: null });
  expect(catalog).toHaveBeenCalledWith({ cursor: 'mess', limit: 10 });
  expect(scopes.branch).not.toHaveBeenCalled();
  expect(transaction).not.toHaveBeenCalled();
});
it('SEC-003: public catalog cannot receive a hidden branch or unbounded page', async () => {
  expect(
    (await application.inject({ url: '/v1/marketplace/amenities?branchId=' + branchId }))
      .statusCode,
  ).toBe(400);
  expect(
    (await application.inject({ url: '/v1/marketplace/amenities?limit=101' })).statusCode,
  ).toBe(400);
  expect(catalog).not.toHaveBeenCalled();
});

it('SEC-001: cookie listing mutations require actual CSRF proof before authorization or save', async () => {
  const response = await application.inject({
    method: 'PUT',
    url,
    headers: {
      cookie: 'hsm_access=access',
      origin: 'http://localhost:3000',
      'Idempotency-Key': randomUUID(),
      'If-Match': '"' + before.version + '"',
    },
    payload: body,
  });
  expect(response.statusCode).toBe(403);
  expect(authorize).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
});
