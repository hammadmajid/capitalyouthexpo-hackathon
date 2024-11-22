import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { adminAnnouncementQuerySchema, adminInstitutionQuerySchema } from '@hsm/contracts';
import { createApplication } from '../../src/app.js';
import type { AdminReferenceReadService } from '../../src/admin/reference-read.service.js';
import { actorNames, authentication, config, infrastructure } from './scope-fixture.js';
const id = '10000000-0000-4000-8000-000000000001';
const notices = vi.fn((_actor: unknown, query: unknown) => {
  adminAnnouncementQuerySchema.parse(query);
  return { data: [], nextCursor: null };
});
const institutions = vi.fn((_actor: unknown, query: unknown) => {
  adminInstitutionQuerySchema.parse(query);
  return { data: [], nextCursor: null };
});
const institution = vi.fn(() => ({ id }));
let app: NestFastifyApplication;
beforeAll(async () => {
  app = await createApplication(config, infrastructure, [], authentication, {
    adminReference: {
      announcements: notices,
      institutions,
      institution,
    } as unknown as AdminReferenceReadService,
  });
});
afterAll(async () => {
  await app?.close();
});
beforeEach(() => vi.clearAllMocks());
it.each(actorNames)(
  'ADM-010 GEO-003: announcement and private institution roles are enforced on actual routes, actor=%s',
  async (actor) => {
    for (const [path, allowed] of [
      ['/v1/admin/announcement-history', ['root', 'support'].includes(actor)],
      ['/v1/admin/institutions', actor === 'root'],
      ['/v1/admin/institutions/' + id, actor === 'root'],
    ] as const) {
      const result = await app.inject({ url: path, headers: { authorization: 'Bearer ' + actor } });
      expect(result.statusCode).toBe(allowed ? 200 : 403);
      if (allowed) expect(result.headers['cache-control']).toBe('no-store');
    }
  },
);
it('ADM-010 GEO-003: malformed filters, UUID and anonymous reads deny', async () => {
  for (const path of [
    '/v1/admin/announcement-history?limit=51',
    '/v1/admin/announcement-history?status=fake',
    '/v1/admin/institutions?cursor=invalid',
    '/v1/admin/institutions?active=archived',
    '/v1/admin/institutions/bad',
  ])
    expect(
      (await app.inject({ url: path, headers: { authorization: 'Bearer root' } })).statusCode,
    ).toBe(400);
  expect((await app.inject({ url: '/v1/admin/announcement-history' })).statusCode).toBe(401);
});
