import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { adminListQuerySchema } from '@hsm/contracts';
import { createApplication } from '../../src/app.js';
import type { PlatformAdmin } from '../../src/admin/admin.controller.js';
import { actorNames, authentication, config, infrastructure } from './scope-fixture.js';
const target = '10000000-0000-4000-8000-000000000001';
const account = {
  userId: target,
  fullName: 'Staff fixture',
  isRoot: false,
  status: 'active',
  roles: ['support'],
};
const list = vi.fn((_actor: unknown, query: unknown) => {
  adminListQuerySchema.parse(query);
  return { data: [account], nextCursor: null, totalCount: 1, activeRootCount: 1 };
});
const detail = vi.fn(async () => account);
let app: NestFastifyApplication;
beforeAll(async () => {
  app = await createApplication(config, infrastructure, [], authentication, {
    platformAdmin: {
      admins: { list, detail },
      governance: {},
      support: {},
    } as unknown as PlatformAdmin,
  });
});
afterAll(async () => {
  await app?.close();
});
beforeEach(() => vi.clearAllMocks());
it.each(actorNames)(
  'ADM-001 SEC-001: actual list and detail routes require Root, actor=%s',
  async (actor) => {
    for (const url of ['/v1/admin/admins?limit=1', '/v1/admin/admins/' + target]) {
      const response = await app.inject({ url, headers: { authorization: 'Bearer ' + actor } });
      expect(response.statusCode).toBe(actor === 'root' ? 200 : 403);
      if (actor === 'root') expect(response.headers['cache-control']).toBe('no-store');
    }
    if (actor !== 'root') {
      expect(list).not.toHaveBeenCalled();
      expect(detail).not.toHaveBeenCalled();
    }
  },
);
it('ADM-001: malformed list cursor and detail UUID fail validation; anonymous caller denied', async () => {
  expect((await app.inject({ url: '/v1/admin/admins' })).statusCode).toBe(401);
  expect(
    (
      await app.inject({
        url: '/v1/admin/admins/not-an-id',
        headers: { authorization: 'Bearer root' },
      })
    ).statusCode,
  ).toBe(400);
  expect(detail).not.toHaveBeenCalled();
  expect(
    (
      await app.inject({
        url: '/v1/admin/admins?cursor=invalid',
        headers: { authorization: 'Bearer root' },
      })
    ).statusCode,
  ).toBe(400);
});
it('ADM-001: generated OpenAPI describes actual continuation and Root detail route', () => {
  const doc = SwaggerModule.createDocument(app, new DocumentBuilder().build());
  const route = doc.paths['/v1/admin/admins']?.get;
  expect(route?.parameters?.map((p) => ('name' in p ? p.name : ''))).toEqual(
    expect.arrayContaining(['cursor', 'limit']),
  );
  expect(doc.paths['/v1/admin/admins/{userId}']?.get?.operationId).toBe('readAdminAccount');
});
