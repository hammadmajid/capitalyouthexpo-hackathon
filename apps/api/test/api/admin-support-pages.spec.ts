import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { supportMessageQuerySchema } from '@hsm/contracts';
import { createApplication } from '../../src/app.js';
import type { PlatformAdmin } from '../../src/admin/admin.controller.js';
import { actorNames, authentication, config, infrastructure } from './scope-fixture.js';
const ticketId = '10000000-0000-4000-8000-000000000001';
const read = vi.fn((_actor: unknown, _id: string, query: unknown) => {
  supportMessageQuerySchema.parse(query);
  return { ticketId, data: [], nextCursor: null };
});
let app: NestFastifyApplication;
beforeAll(async () => {
  app = await createApplication(config, infrastructure, [], authentication, {
    platformAdmin: {
      admins: {},
      governance: {},
      support: { staffMessages: read, ownMessages: read },
    } as unknown as PlatformAdmin,
  });
});
afterAll(async () => {
  await app?.close();
});
beforeEach(() => vi.clearAllMocks());
it.each(actorNames)(
  'ADM-009 SEC-003: actual staff message route requires Support or Root, actor=%s',
  async (actor) => {
    const result = await app.inject({
      url: '/v1/admin/support-tickets/' + ticketId + '/messages?limit=2',
      headers: { authorization: 'Bearer ' + actor },
    });
    const allowed = actor === 'support' || actor === 'root';
    expect(result.statusCode).toBe(allowed ? 200 : 403);
    if (allowed) expect(result.headers['cache-control']).toBe('no-store');
    else expect(read).not.toHaveBeenCalled();
  },
);
it('ADM-009: own messages uses authenticated participant scope, validates cursor/limit and UUID', async () => {
  const path = '/v1/support/tickets/' + ticketId + '/messages';
  expect((await app.inject({ url: path })).statusCode).toBe(401);
  expect(
    (await app.inject({ url: path, headers: { authorization: 'Bearer customer' } })).statusCode,
  ).toBe(200);
  for (const suffix of ['?cursor=invalid', '?limit=101', '?limit=0'])
    expect(
      (await app.inject({ url: path + suffix, headers: { authorization: 'Bearer customer' } }))
        .statusCode,
    ).toBe(400);
  expect(
    (
      await app.inject({
        url: '/v1/support/tickets/bad/messages',
        headers: { authorization: 'Bearer customer' },
      })
    ).statusCode,
  ).toBe(400);
});
it('ADM-009: generated OpenAPI documents bounded continuation on both staff and participant routes', () => {
  const doc = SwaggerModule.createDocument(app, new DocumentBuilder().build());
  for (const path of [
    '/v1/admin/support-tickets/{ticketId}/messages',
    '/v1/support/tickets/{ticketId}/messages',
  ]) {
    const route = doc.paths[path]?.get;
    expect(route?.parameters?.map((p) => ('name' in p ? p.name : ''))).toEqual(
      expect.arrayContaining(['cursor', 'limit', 'ticketId']),
    );
  }
});
