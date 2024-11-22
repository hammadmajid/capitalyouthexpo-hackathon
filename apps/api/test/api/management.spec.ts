import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DomainError } from '@hsm/contracts';
import { createApplication } from '../../src/app.js';
import { parseEnvironment } from '../../src/config.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { AuthTransport } from '../../src/auth/transport.js';
import type { SessionService } from '../../src/auth/session.service.js';
import type { ManagementService } from '../../src/management/service.js';
import { testKeys } from '../keys.js';
vi.setConfig({ testTimeout: 30000 });
const actor = { userId: randomUUID(), sessionId: randomUUID() };
const branchId = randomUUID(),
  assignmentId = randomUUID();
const state = { id: assignmentId, branchId, status: 'active' };
const services = {
  cities: vi.fn(),
  areas: vi.fn(),
  organizations: vi.fn(),
  branches: vi.fn(),
  branch: vi.fn(),
  managers: vi.fn(),
  transition: vi.fn(),
  remove: vi.fn(),
};
const scopes = {
  owner: vi.fn(),
  branch: vi.fn(),
  customer: vi.fn(),
  object: vi.fn(),
  admin: vi.fn(),
};
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
    { management: services as unknown as ManagementService },
  );
});
beforeEach(() => {
  vi.resetAllMocks();
  scopes.owner.mockResolvedValue(true);
  scopes.branch.mockResolvedValue(true);
  services.organizations.mockResolvedValue({ data: [], nextCursor: null });
  services.branches.mockResolvedValue({ data: [], nextCursor: null });
  services.branch.mockResolvedValue({ id: branchId });
  services.managers.mockResolvedValue({ data: [], nextCursor: null });
  services.transition.mockResolvedValue(state);
});
afterAll(async () => {
  await application?.close();
});
const bearer = { authorization: 'Bearer test' };
const assignment = '/v1/manage/branches/' + branchId + '/managers/' + assignmentId;
it('SEC-001: every management read requires authentication and passes the trusted actor', async () => {
  for (const url of [
    '/v1/owner/organizations',
    '/v1/owner/branches',
    '/v1/manage/branches',
    '/v1/manage/branches/' + branchId,
    '/v1/manage/branches/' + branchId + '/managers',
  ]) {
    expect((await application.inject({ method: 'GET', url })).statusCode).toBe(401);
    const response = await application.inject({ method: 'GET', url, headers: bearer });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
  }
  expect(services.organizations).toHaveBeenCalledWith(actor, { limit: 20 });
  expect(services.branches).toHaveBeenCalledWith(actor, { limit: 20 }, true);
  expect(services.branches).toHaveBeenCalledWith(actor, { limit: 20 }, false);
  expect(services.branch).toHaveBeenCalledWith(actor, branchId);
  expect(services.managers).toHaveBeenCalledWith(actor, branchId, { limit: 20 });
});
it.each(['suspend', 'reinstate', 'deactivate'] as const)(
  'MGR-004: %s routes enforce ownership and forward validated input',
  async (action) => {
    const payload =
      action === 'suspend'
        ? { reason: 'Owner reason' }
        : action === 'deactivate'
          ? { currentPassword: 'Owner password 1' }
          : {};
    expect(
      (await application.inject({ method: 'POST', url: assignment + '/' + action, payload }))
        .statusCode,
    ).toBe(401);
    const response = await application.inject({
      method: 'POST',
      url: assignment + '/' + action,
      payload,
      headers: bearer,
    });
    expect(response.statusCode).toBe(200);
    if (action === 'suspend')
      expect(services.transition).toHaveBeenCalledWith(
        actor,
        branchId,
        assignmentId,
        action,
        'Owner reason',
      );
    else if (action === 'deactivate')
      // AUTH-M-006: removal goes through the password-checked service path.
      expect(services.remove).toHaveBeenCalledWith(
        actor,
        branchId,
        assignmentId,
        'Owner password 1',
      );
    else expect(services.transition).toHaveBeenCalledWith(actor, branchId, assignmentId, action);
    scopes.branch.mockResolvedValue(false);
    expect(
      (
        await application.inject({
          method: 'POST',
          url: assignment + '/' + action,
          payload,
          headers: bearer,
        })
      ).statusCode,
    ).toBe(403);
  },
);
it('SEC-001: strict queries, identifiers and action bodies reject injection before dispatch', async () => {
  for (const url of [
    '/v1/manage/branches?limit=101',
    '/v1/manage/branches?cursor=bad',
    '/v1/manage/branches?owner=true',
    '/v1/manage/branches/invalid',
  ])
    expect((await application.inject({ method: 'GET', url, headers: bearer })).statusCode).toBe(
      400,
    );
  for (const [action, payload] of [
    ['suspend', {}],
    ['suspend', { reason: 'valid', userId: actor.userId }],
    ['reinstate', { status: 'active' }],
    ['deactivate', { force: true }],
  ] as const)
    expect(
      (
        await application.inject({
          method: 'POST',
          url: assignment + '/' + action,
          headers: bearer,
          payload,
        })
      ).statusCode,
    ).toBe(400);
  expect(services.transition).not.toHaveBeenCalled();
});
it('SEC-001: cookie mutations require existing CSRF protection', async () => {
  const response = await application.inject({
    method: 'POST',
    url: assignment + '/suspend',
    headers: { cookie: 'hsm_access=access; hsm_refresh=refresh' },
    payload: { reason: 'Owner reason' },
  });
  expect(response.statusCode).toBe(403);
  expect(services.transition).not.toHaveBeenCalled();
});
it('SEC-003: service failures use sanitized correlation problems', async () => {
  services.remove.mockRejectedValue(new DomainError('NOT_FOUND', 404, 'Secret object detail'));
  const response = await application.inject({
    method: 'POST',
    url: assignment + '/deactivate',
    headers: bearer,
    payload: { currentPassword: 'Owner password 1' },
  });
  expect(response.statusCode).toBe(404);
  expect(response.json()).toMatchObject({ code: 'NOT_FOUND', traceId: expect.any(String) });
  expect(response.body).not.toContain('Secret object detail');
});

it('SEC-001: published management OpenAPI describes pagination and strict action bodies', async () => {
  const response = await application.inject({ method: 'GET', url: '/v1/docs-json' });
  expect(response.statusCode).toBe(200);
  const document = response.json<{
    paths: Record<
      string,
      {
        get?: { parameters: { name: string }[] };
        post?: { requestBody: unknown; responses: Record<string, unknown> };
      }
    >;
  }>();
  expect(
    document.paths['/v1/owner/branches']?.get?.parameters.map((parameter) => parameter.name),
  ).toEqual(expect.arrayContaining(['cursor', 'limit']));
  expect(
    document.paths['/v1/manage/branches/{branchId}/managers/{assignmentId}/suspend']?.post
      ?.requestBody,
  ).toBeDefined();
  expect(
    document.paths['/v1/manage/branches/{branchId}/managers/{assignmentId}/deactivate']?.post
      ?.responses['200'],
  ).toBeDefined();
});

it('SEC-001: the generated OpenAPI list contract represents a null terminal cursor in 3.1', async () => {
  const response = await application.inject({ method: 'GET', url: '/v1/docs-json' });
  const document = response.json<{
    paths: Record<
      string,
      {
        get?: {
          responses: Record<
            string,
            { content: Record<string, { schema: { properties: { nextCursor: unknown } } }> }
          >;
        };
      }
    >;
  }>();
  expect(
    document.paths['/v1/owner/branches']?.get?.responses['200']?.content['application/json']?.schema
      .properties.nextCursor,
  ).toEqual({
    anyOf: [{ type: 'string', format: 'uuid' }, { type: 'null' }],
  });
});

it('ONB-001 SEC-001: geography routes require authentication, live Owner and no-store', async () => {
  services.cities.mockResolvedValue({ data: [], nextCursor: null });
  services.areas.mockResolvedValue({ data: [], nextCursor: null });
  for (const url of [
    '/v1/owner/geography/cities',
    '/v1/owner/geography/cities/' + branchId + '/areas?parentId=' + assignmentId,
  ]) {
    expect((await application.inject({ method: 'GET', url })).statusCode).toBe(401);
    const response = await application.inject({ method: 'GET', url, headers: bearer });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    scopes.owner.mockResolvedValue(false);
    expect((await application.inject({ method: 'GET', url, headers: bearer })).statusCode).toBe(
      403,
    );
    scopes.owner.mockResolvedValue(true);
  }
  expect(services.cities).toHaveBeenCalledExactlyOnceWith(actor, { limit: 20 });
  expect(services.areas).toHaveBeenCalledExactlyOnceWith(actor, branchId, {
    limit: 20,
    parentId: assignmentId,
  });
});
it('ONB-001 SEC-001: geography IDs, parent IDs and query limits reject injection', async () => {
  for (const url of [
    '/v1/owner/geography/cities?limit=101',
    '/v1/owner/geography/cities?userId=' + actor.userId,
    '/v1/owner/geography/cities/bad/areas',
    '/v1/owner/geography/cities/' + branchId + '/areas?parentId=bad',
    '/v1/owner/geography/cities/' + branchId + '/areas?includeInactive=true',
  ])
    expect((await application.inject({ method: 'GET', url, headers: bearer })).statusCode).toBe(
      400,
    );
  expect(services.cities).not.toHaveBeenCalled();
  expect(services.areas).not.toHaveBeenCalled();
});

it('AUTH-M-006: removal without the Owner password is rejected before any change', async () => {
  const response = await application.inject({
    method: 'POST',
    url: assignment + '/deactivate',
    headers: bearer,
    payload: {},
  });
  expect(response.statusCode).toBe(400);
  expect(services.remove).not.toHaveBeenCalled();
  expect(services.transition).not.toHaveBeenCalled();
});
