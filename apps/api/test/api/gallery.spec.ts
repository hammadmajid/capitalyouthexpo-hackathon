import { verifiedKey } from '@hsm/files';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DomainError } from '@hsm/contracts';
import { createApplication } from '../../src/app.js';
import { parseEnvironment } from '../../src/config.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { AuthTransport } from '../../src/auth/transport.js';
import type { SessionService } from '../../src/auth/session.service.js';
import { GalleryService } from '../../src/inventory/gallery.service.js';
import { GalleryRepository } from '../../src/inventory/gallery.repository.js';
import { IdempotencyService } from '../../src/idempotency/service.js';
import type { IdempotencyStore, StoredResponse } from '../../src/idempotency/store.js';
import { requireTransaction } from '../../src/idempotency/context.js';
import { queryFixture } from '../unit/query-fixture.js';
import { testKeys } from '../keys.js';
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  branchId = randomUUID(),
  mediaId = randomUUID(),
  fileId = randomUUID(),
  version = 'a'.repeat(64),
  store = queryFixture(),
  rows = new Map<string, StoredResponse>();
const media = {
  id: mediaId,
  branchId,
  fileId,
  version,
  altText: 'Exterior',
  sortOrder: 0,
  roomId: null,
  bedId: null,
  scanStatus: 'clean' as const,
  publishedAt: null,
  archivedAt: null,
};
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
const repository = new GalleryRepository(store.database, 'private'),
  read = vi.spyOn(repository, 'read'),
  authorize = vi.spyOn(repository, 'authorize'),
  authorizeImage = vi.spyOn(repository, 'authorizeImageAction'),
  attach = vi.spyOn(repository, 'attach'),
  edit = vi.spyOn(repository, 'edit'),
  archive = vi.spyOn(repository, 'archive'),
  cover = vi.spyOn(repository, 'cover');
const service = new GalleryService(repository, new IdempotencyService(writeStore));
const scopes = {
  owner: vi.fn(),
  branch: vi.fn(),
  customer: vi.fn(),
  object: vi.fn(),
  admin: vi.fn(),
};
const url = `/v1/branches/${branchId}/gallery`,
  headers = { authorization: 'Bearer access' };
const writeHeaders = (key = randomUUID()) => ({
  ...headers,
  'Idempotency-Key': key,
  'If-Match': '"' + version + '"',
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
    { gallery: service },
  );
});
afterAll(async () => {
  await application?.close();
});
beforeEach(() => {
  vi.clearAllMocks();
  rows.clear();
  scopes.branch.mockResolvedValue(true);
  authorize.mockResolvedValue({
    organizationId: randomUUID(),
    brandId: randomUUID(),
    ownerId: actor.userId,
    actorRole: 'owner',
  });
  authorizeImage.mockImplementation(async (transaction, requestedActor, branch) => ({
    scope: await repository.authorize(transaction, requestedActor, branch),
    row: {
      ...media,
      createdAt: new Date(),
      publishedByUserId: null,
      seatId: null,
      objectKey: verifiedKey('listing_photo', fileId),
      sha256: Buffer.alloc(32, 1),
      mimeType: 'image/png',
      sizeBytes: 100n,
    },
  }));
  read.mockResolvedValue({ data: [media], nextCursor: null, canEdit: true, canPublish: true });
  for (const operation of [attach, edit, archive, cover])
    operation.mockImplementation(async (transaction) => {
      expect(requireTransaction()).toBe(transaction);
      return media;
    });
});
it('ROOM-003 / ACC-004: private gallery reads are bounded, no-store and carry actual permission', async () => {
  read.mockResolvedValue({ data: [media], nextCursor: null, canEdit: false, canPublish: false });
  const response = await application.inject({ url: url + '?limit=10&state=archived', headers });
  expect(response.statusCode).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.json()).toEqual({
    data: [media],
    nextCursor: null,
    canEdit: false,
    canPublish: false,
  });
  expect(read).toHaveBeenCalledWith(actor, branchId, { limit: 10, state: 'archived' });
  expect(authorize).not.toHaveBeenCalled();
});
it('SEC-003: anonymous and foreign-branch reads are denied before gallery access', async () => {
  expect((await application.inject({ url })).statusCode).toBe(401);
  scopes.branch.mockResolvedValue(false);
  expect((await application.inject({ url, headers })).statusCode).toBe(403);
  expect(read).not.toHaveBeenCalled();
});
it('ROOM-003: attachment is idempotent, transaction-bound and returns a quoted version', async () => {
  const key = randomUUID(),
    payload = { fileId: fileId.toUpperCase(), altText: ' Exterior ', sortOrder: 0 };
  const first = await application.inject({
    method: 'POST',
    url,
    headers: writeHeaders(key),
    payload,
  });
  expect(first.statusCode).toBe(201);
  expect(first.headers.etag).toBe('"' + version + '"');
  expect(first.json().publishedAt).toBeNull();
  const replay = await application.inject({
    method: 'POST',
    url,
    headers: writeHeaders(key),
    payload,
  });
  expect(replay.statusCode).toBe(201);
  expect(replay.headers['idempotency-replayed']).toBe('true');
  expect(attach).toHaveBeenCalledOnce();
  expect(authorize).toHaveBeenCalledTimes(2);
  expect(attach).toHaveBeenCalledWith(store.transaction, actor, branchId, {
    fileId,
    altText: 'Exterior',
    sortOrder: 0,
  });
});
it.each([
  {
    method: 'PUT' as const,
    suffix: '',
    payload: { altText: 'Exterior', sortOrder: 0, published: true },
    kind: 'edit',
  },
  {
    method: 'POST' as const,
    suffix: '/archive',
    payload: { reason: ' Replaced ' },
    kind: 'archive',
  },
  { method: 'POST' as const, suffix: '/cover', payload: {}, kind: 'cover' },
])(
  'ROOM-003 / AUD-001: $kind uses a version-bound command and safe replay',
  async ({ method, suffix, payload, kind }) => {
    const key = randomUUID(),
      target = url + '/' + mediaId + suffix;
    const first = await application.inject({
      method,
      url: target,
      headers: writeHeaders(key),
      payload,
    });
    expect(first.statusCode).toBe(200);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(first.headers.etag).toBe('"' + version + '"');
    const replay = await application.inject({
      method,
      url: target,
      headers: writeHeaders(key),
      payload,
    });
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(authorize).toHaveBeenCalledTimes(2);
    expect(kind === 'edit' ? edit : kind === 'archive' ? archive : cover).toHaveBeenCalledOnce();
  },
);
it('ACC-004: revoked listing grant denies stored attachment replay', async () => {
  const key = randomUUID(),
    payload = { fileId, altText: 'Exterior', sortOrder: 0 };
  expect(
    (await application.inject({ method: 'POST', url, headers: writeHeaders(key), payload }))
      .statusCode,
  ).toBe(201);
  authorize.mockRejectedValue(new DomainError('FORBIDDEN', 403, 'Revoked'));
  expect(
    (await application.inject({ method: 'POST', url, headers: writeHeaders(key), payload }))
      .statusCode,
  ).toBe(403);
  expect(attach).toHaveBeenCalledOnce();
});
it('ROOM-003: changed version cannot reuse an existing command key', async () => {
  const key = randomUUID(),
    payload = { altText: 'Exterior', sortOrder: 0, published: true },
    target = url + '/' + mediaId;
  expect(
    (await application.inject({ method: 'PUT', url: target, headers: writeHeaders(key), payload }))
      .statusCode,
  ).toBe(200);
  const changed = await application.inject({
    method: 'PUT',
    url: target,
    headers: { ...writeHeaders(key), 'If-Match': '"' + 'b'.repeat(64) + '"' },
    payload,
  });
  expect(changed.statusCode).toBe(409);
  expect(changed.json().code).toBe('IDEMPOTENCY_KEY_REUSED');
  expect(edit).toHaveBeenCalledOnce();
});
it('ROOM-003: stale writes produce typed 412 and store no success', async () => {
  edit.mockRejectedValue(new DomainError('PRECONDITION_FAILED', 412, 'Changed'));
  const response = await application.inject({
    method: 'PUT',
    url: url + '/' + mediaId,
    headers: writeHeaders(),
    payload: { altText: 'Exterior', sortOrder: 0, published: false },
  });
  expect(response.statusCode).toBe(412);
  expect(response.json().code).toBe('PRECONDITION_FAILED');
  expect(rows.size).toBe(0);
});
it.each([undefined, version, '"bad"'])(
  'ROOM-003: invalid If-Match %s fails before transaction authorization',
  async (ifMatch) => {
    const requestHeaders = {
      ...headers,
      'Idempotency-Key': randomUUID(),
      ...(ifMatch ? { 'If-Match': ifMatch } : {}),
    };
    expect(
      (
        await application.inject({
          method: 'POST',
          url: url + '/' + mediaId + '/cover',
          headers: requestHeaders,
          payload: {},
        })
      ).statusCode,
    ).toBe(400);
    expect(authorize).not.toHaveBeenCalled();
  },
);
it('SEC-003: hidden scope, storage keys and implicit publication cannot cross strict boundaries', async () => {
  expect((await application.inject({ url: url + '?limit=101', headers })).statusCode).toBe(400);
  expect(
    (await application.inject({ url: url + '?customerId=' + actor.userId, headers })).statusCode,
  ).toBe(400);
  expect(
    (
      await application.inject({
        method: 'POST',
        url,
        headers: writeHeaders(),
        payload: { fileId, altText: 'Exterior', sortOrder: 0, published: true },
      })
    ).statusCode,
  ).toBe(400);
  expect(
    (
      await application.inject({
        method: 'POST',
        url: url + '/' + mediaId + '/cover',
        headers: writeHeaders(),
        payload: { objectKey: 'private/key' },
      })
    ).statusCode,
  ).toBe(400);
  expect(read).not.toHaveBeenCalled();
  expect(authorize).not.toHaveBeenCalled();
});
it('SEC-001: cookie gallery mutations require CSRF proof before permission checks', async () => {
  const response = await application.inject({
    method: 'POST',
    url,
    headers: {
      cookie: 'hsm_access=access',
      origin: 'http://localhost:3000',
      'Idempotency-Key': randomUUID(),
    },
    payload: { fileId, altText: 'Exterior', sortOrder: 0 },
  });
  expect(response.statusCode).toBe(403);
  expect(authorize).not.toHaveBeenCalled();
  expect(attach).not.toHaveBeenCalled();
});
