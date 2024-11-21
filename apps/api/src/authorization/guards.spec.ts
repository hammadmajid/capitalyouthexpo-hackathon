import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ACCESS_SCOPE } from './scope.js';
import {
  actorOf,
  AuthGuard,
  AuthorizationGuard,
  OwnerGuard,
  BranchScopeGuard,
  ObjectScopeGuard,
  AdminGuard,
} from './guards.js';
import { scopes, authentication } from '../../test/api/scope-fixture.js';
function context(
  scope: unknown,
  request: unknown = {
    headers: { authorization: 'Bearer owner' },
    cookies: {},
    method: 'GET',
    params: {},
  },
) {
  function Controller() {
    return undefined;
  }
  const handler = () => undefined;
  if (scope !== undefined) Reflect.defineMetadata(ACCESS_SCOPE, scope, handler);
  return {
    getHandler: () => handler,
    getClass: () => Controller,
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({ header: vi.fn() }) }),
  } as unknown as ExecutionContext;
}
it('SEC: guards reject undeclared scopes and unavailable authentication', async () => {
  await expect(new AuthGuard(authentication).canActivate(context(undefined))).rejects.toMatchObject(
    { status: 403 },
  );
  await expect(
    new AuthorizationGuard(scopes).canActivate(context({ kind: 'invalid' })),
  ).rejects.toMatchObject({ status: 403 });
  await expect(new AuthGuard().canActivate(context({ kind: 'self' }))).rejects.toMatchObject({
    status: 401,
  });
  expect(() => actorOf({} as FastifyRequest)).toThrow('Authentication required');
  expect(await new AuthGuard().canActivate(context({ kind: 'public' }))).toBe(true);
});
it.each([OwnerGuard, BranchScopeGuard, ObjectScopeGuard, AdminGuard])(
  'SEC: specialized guard rejects an incompatible scope',
  async (Guard) => {
    await expect(new Guard(scopes).canActivate(context({ kind: 'self' }))).rejects.toMatchObject({
      status: 403,
    });
  },
);
it('ACC-002: owner-only object scope binds the authenticated actor and route branch', async () => {
  const branchId = randomUUID(),
    assignmentId = randomUUID();
  const request = {
    headers: { authorization: 'Bearer owner' },
    cookies: {},
    method: 'GET',
    params: { branchId, assignmentId },
  };
  const execution = context(
    {
      kind: 'object',
      resource: 'manager_assignment',
      idParam: 'assignmentId',
      branchParam: 'branchId',
      ownerOnly: true,
    },
    request,
  );
  await new AuthGuard(authentication).canActivate(execution);
  vi.mocked(scopes.object).mockResolvedValueOnce({ branchId });
  expect(await new ObjectScopeGuard(scopes).canActivate(execution)).toBe(true);
  expect(scopes.object).toHaveBeenCalledWith('owner', assignmentId, true, branchId);
});
