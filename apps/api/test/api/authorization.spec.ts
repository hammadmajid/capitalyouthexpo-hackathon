import { Controller, Get, SetMetadata } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createApplication } from '../../src/app.js';
import { ACCESS_SCOPE, Self } from '../../src/access.js';
import { ScopeProbe } from '../security/scope-probe.js';
import {
  actorNames,
  authentication,
  config,
  ids,
  infrastructure,
  scopes,
} from './scope-fixture.js';
vi.setConfig({ testTimeout: 30000 });
let app: NestFastifyApplication;
beforeAll(async () => {
  app = await createApplication(config, infrastructure, [ScopeProbe], authentication);
});
afterAll(async () => {
  await app?.close();
});
const routes = [
  { path: 'self', allowed: [...actorNames], denial: 403 },
  { path: 'customer', allowed: ['customer', 'multi'], denial: 403 },
  { path: 'owner', allowed: ['owner', 'multi'], denial: 403 },
  { path: 'organizations/' + ids.orgA, allowed: ['owner', 'multi'], denial: 403 },
  { path: 'organizations/' + ids.orgB, allowed: [], denial: 403 },
  { path: 'branches/' + ids.branchA, allowed: ['owner', 'managerA', 'multi'], denial: 403 },
  { path: 'branches/' + ids.branchB, allowed: ['owner', 'managerB', 'multi'], denial: 403 },
  { path: 'owner-branches/' + ids.branchA, allowed: ['owner', 'multi'], denial: 403 },
  { path: 'objects/' + ids.objectA, allowed: ['owner', 'managerA', 'multi'], denial: 404 },
  { path: 'branches/' + ids.branchA + '/objects/' + ids.objectB, allowed: [], denial: 404 },
  { path: 'admin/verification', allowed: ['root', 'verification'], denial: 403 },
  { path: 'admin/support', allowed: ['root', 'support'], denial: 403 },
  { path: 'admin/content', allowed: ['root', 'content'], denial: 403 },
  { path: 'admin/billing', allowed: [], denial: 403 },
  { path: 'admin/root', allowed: ['root'], denial: 403 },
  { path: 'stay', allowed: [], denial: 403 },
];
const matrix = routes.flatMap((route) =>
  ['guest', ...actorNames].map((actor) => ({
    ...route,
    actor,
    expected: actor === 'guest' ? 401 : route.allowed.includes(actor) ? 200 : route.denial,
  })),
);
it.each(matrix)(
  'ACC-002 / SEC: $actor → $path returns $expected',
  async ({ actor, path, expected }) => {
    const response = await app.inject({
      url: '/v1/scope-probe/' + path,
      headers: actor === 'guest' ? {} : { authorization: 'Bearer ' + actor },
    });
    expect(response.statusCode).toBe(expected);
    if (expected === 200) expect(response.headers['cache-control']).toBe('no-store');
  },
);
it('SEC: malformed scope identifiers fail validation and unknown objects stay hidden', async () => {
  expect(
    (
      await app.inject({
        url: '/v1/scope-probe/branches/invalid',
        headers: { authorization: 'Bearer managerA' },
      })
    ).statusCode,
  ).toBe(400);
  expect(
    (
      await app.inject({
        url: '/v1/scope-probe/objects/' + randomUUID(),
        headers: { authorization: 'Bearer managerA' },
      })
    ).statusCode,
  ).toBe(404);
});
it('SEC: request body, query and headers cannot substitute for server-side branch membership', async () => {
  const response = await app.inject({
    url: '/v1/scope-probe/branches/' + ids.branchB + '?branchId=' + ids.branchA,
    headers: { authorization: 'Bearer managerA', 'x-branch-id': ids.branchA },
  });
  expect(response.statusCode).toBe(403);
  expect(scopes.branch).toHaveBeenCalledWith('managerA', ids.branchB, false);
});
it('SEC: scope checks re-evaluate live grants on the next request', async () => {
  vi.mocked(scopes.branch).mockResolvedValueOnce(false);
  expect(
    (
      await app.inject({
        url: '/v1/scope-probe/branches/' + ids.branchA,
        headers: { authorization: 'Bearer managerA' },
      })
    ).statusCode,
  ).toBe(403);
});
@Controller('undeclared')
class Undeclared {
  @Get() read() {
    return {};
  }
}
@SetMetadata(ACCESS_SCOPE, { kind: 'unknown' })
@Controller('invalid-scope')
class InvalidScope {
  @Get() read() {
    return {};
  }
}
class BaseRoute {
  @Get() read() {
    return {};
  }
}
@Controller('inherited')
class InheritedScope extends BaseRoute {}
it.each([Undeclared, InvalidScope, InheritedScope])(
  'SEC: startup rejects absent/invalid declarations: %s',
  async (controller) => {
    await expect(createApplication(config, infrastructure, [controller])).rejects.toThrow(
      /Missing or invalid route scope/,
    );
  },
);
@Self()
@Controller('self-only')
class SelfOnly {
  @Get() read() {
    return {};
  }
}
it('SEC: missing capability dependencies fail closed while explicit SELF remains usable', async () => {
  const isolated = await createApplication(config, infrastructure, [ScopeProbe, SelfOnly], {
    sessions: authentication.sessions,
    transport: authentication.transport,
  });
  try {
    const headers = { authorization: 'Bearer owner' };
    expect((await isolated.inject({ url: '/v1/scope-probe/owner', headers })).statusCode).toBe(403);
    expect((await isolated.inject({ url: '/v1/scope-probe/customer', headers })).statusCode).toBe(
      403,
    );
    expect((await isolated.inject({ url: '/v1/self-only', headers })).statusCode).toBe(200);
  } finally {
    await isolated.close();
  }
});
