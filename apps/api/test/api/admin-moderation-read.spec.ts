import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createApplication } from '../../src/app.js';
import type { ModerationReadService } from '../../src/admin/moderation-read.service.js';
import { actorNames, authentication, config, infrastructure } from './scope-fixture.js';
const id = '10000000-0000-4000-8000-000000000001';
const service = {
  reports: vi.fn(async () => ({ data: [], nextCursor: null })),
  reviews: vi.fn(async () => ({ data: [], nextCursor: null })),
  detail: vi.fn(async () => ({ reviewId: id })),
  history: vi.fn(async () => ({ data: [], nextCursor: null })),
};
let app: NestFastifyApplication;
beforeAll(async () => {
  app = await createApplication(config, infrastructure, [], authentication, {
    moderationRead: service as unknown as ModerationReadService,
  });
});
afterAll(async () => {
  await app?.close();
});
beforeEach(() => vi.clearAllMocks());
it.each(actorNames)(
  'REV-006 SEC-001: all moderation readers enforce actual role guards for %s',
  async (actor) => {
    for (const path of ['reports', 'reviews', 'reviews/' + id, 'reviews/' + id + '/history']) {
      const response = await app.inject({
        url: '/v1/admin/moderation/' + path,
        headers: { authorization: 'Bearer ' + actor },
      });
      expect(response.statusCode).toBe(['root', 'content'].includes(actor) ? 200 : 403);
      if (response.statusCode === 200) expect(response.headers['cache-control']).toBe('no-store');
    }
    if (!['root', 'content'].includes(actor))
      for (const method of Object.values(service)) expect(method).not.toHaveBeenCalled();
  },
);
it('REV-006 SEC-001: invalid target and anonymous caller never reach private review readers', async () => {
  expect((await app.inject({ url: '/v1/admin/moderation/reviews' })).statusCode).toBe(401);
  expect(
    (
      await app.inject({
        url: '/v1/admin/moderation/reviews/invalid',
        headers: { authorization: 'Bearer root' },
      })
    ).statusCode,
  ).toBe(400);
  expect(service.detail).not.toHaveBeenCalled();
});
it('REV-006: OpenAPI exposes report filters, bounded continuation and restoration history', () => {
  const doc = SwaggerModule.createDocument(app, new DocumentBuilder().build());
  expect(
    doc.paths['/v1/admin/moderation/reports']?.get?.parameters?.map((p) =>
      'name' in p ? p.name : '',
    ),
  ).toEqual(
    expect.arrayContaining(['limit', 'cursor', 'reportStatus', 'reviewStatus', 'reviewId']),
  );
  expect(doc.paths['/v1/admin/moderation/reviews/{reviewId}/history']?.get?.operationId).toBe(
    'moderationHistory',
  );
});
