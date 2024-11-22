import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DomainError, encodePublicGalleryCursor } from '@hsm/contracts';
import { createApplication } from '../../src/app.js';
import { parseEnvironment } from '../../src/config.js';
import { PublicGalleryRepository } from '../../src/marketplace/gallery.repository.js';
import { PublicGalleryService } from '../../src/marketplace/gallery.service.js';
import { queryFixture } from '../unit/query-fixture.js';
import { testKeys } from '../keys.js';
const branchId = randomUUID(),
  mediaId = randomUUID(),
  repository = new PublicGalleryRepository(queryFixture().database, 'private-fixture');
const read = vi.spyOn(repository, 'read'),
  service = new PublicGalleryService(repository);
const url = '/v1/marketplace/' + branchId + '/gallery';
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
    undefined,
    { publicGallery: service },
  );
});
afterAll(async () => {
  await application?.close();
});
beforeEach(() => {
  vi.clearAllMocks();
  read.mockResolvedValue({
    branchId,
    data: [{ id: mediaId, altText: 'Published exterior' }],
    nextCursor: null,
  });
});
it('ACC-002: anonymous public metadata is no-store and bounded with explicit normalized request input', async () => {
  const cursor = encodePublicGalleryCursor(2, mediaId),
    response = await application.inject({
      url: url + '?limit=2&cursor=' + encodeURIComponent(cursor),
    });
  expect(response.statusCode).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.json()).toEqual({
    branchId,
    data: [{ id: mediaId, altText: 'Published exterior' }],
    nextCursor: null,
  });
  expect(read).toHaveBeenCalledWith(branchId, { limit: 2, cursor });
});
it.each(['?limit=101', '?limit=0', '?cursor=invalid', '?includePrivate=true', '?state=archived'])(
  'SEC-003: unknown fields and unsafe pagination cannot reach public data %s',
  async (suffix) => {
    expect((await application.inject({ url: url + suffix })).statusCode).toBe(400);
    expect(read).not.toHaveBeenCalled();
  },
);
it('ACC-002: withdrawn or foreign private parent remains opaque not-found', async () => {
  read.mockRejectedValueOnce(new DomainError('NOT_FOUND', 404, 'Listing unavailable'));
  const response = await application.inject({ url });
  expect(response.statusCode).toBe(404);
  expect(response.body).not.toContain('private-fixture');
});
it('ACC-002: actual approved empty state is successful without invented media', async () => {
  read.mockResolvedValueOnce({ branchId, data: [], nextCursor: null });
  const response = await application.inject({ url });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ branchId, data: [], nextCursor: null });
});
it('SEC-003: invalid parent identity cannot reach the repository', async () => {
  expect((await application.inject({ url: url.replace(branchId, 'invalid') })).statusCode).toBe(
    400,
  );
  expect(read).not.toHaveBeenCalled();
});
it('SEC-003: the anonymous metadata route has no publication mutation', async () => {
  expect((await application.inject({ method: 'POST', url, payload: {} })).statusCode).toBe(404);
  expect(read).not.toHaveBeenCalled();
});
