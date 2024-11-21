import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { z } from 'zod';
import type { FastifyRequest } from 'fastify';
import { DomainError } from '@hsm/contracts';
import type { SessionService } from '../auth/session.service.js';
import type { AuthTransport } from '../auth/transport.js';
import { declaration, type AccessScope } from './scope.js';
import type { Actor, ScopeStore } from './store.js';
type ScopeCheck = { canActivate(context: ExecutionContext): boolean | Promise<boolean> };
const actors = new WeakMap<FastifyRequest, Actor>();
export function actorOf(request: FastifyRequest): Actor {
  const actor = actors.get(request);
  if (!actor) throw new DomainError('UNAUTHENTICATED', 401, 'Authentication required');
  return actor;
}
function scopeOf(context: ExecutionContext) {
  const result = declaration(new Reflector(), context.getHandler(), context.getClass());
  if (!result.success) throw new DomainError('FORBIDDEN', 403, 'Access not declared');
  return result.data;
}
function parameter(request: FastifyRequest, name: string) {
  const params = z.record(z.unknown()).parse(request.params);
  return z.string().uuid().parse(Reflect.get(params, name));
}
function requirePermission(allowed: boolean, branch = false) {
  if (!allowed)
    throw new DomainError(branch ? 'BRANCH_FORBIDDEN' : 'FORBIDDEN', 403, 'Access denied');
  return true;
}
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authentication?: {
      sessions: Pick<SessionService, 'authenticate'>;
      transport: AuthTransport;
    },
  ) {}
  async canActivate(context: ExecutionContext) {
    const scope = scopeOf(context);
    if (scope.kind === 'public') return true;
    if (!this.authentication)
      throw new DomainError('UNAUTHENTICATED', 401, 'Authentication required');
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const actor = await this.authentication.sessions.authenticate(
      this.authentication.transport.token(request, 'access'),
    );
    actors.set(request, actor);
    context
      .switchToHttp()
      .getResponse<{ header(name: string, value: string): unknown }>()
      .header('Cache-Control', 'no-store');
    return true;
  }
}
export class OwnerGuard implements CanActivate {
  constructor(private readonly store: ScopeStore) {}
  async canActivate(context: ExecutionContext) {
    const scope = scopeOf(context);
    if (scope.kind !== 'owner') return requirePermission(false);
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    return requirePermission(
      await this.store.owner(
        actorOf(request).userId,
        scope.organizationParam ? parameter(request, scope.organizationParam) : undefined,
      ),
    );
  }
}
export class BranchScopeGuard implements CanActivate {
  constructor(private readonly store: ScopeStore) {}
  async canActivate(context: ExecutionContext) {
    const scope = scopeOf(context);
    if (scope.kind !== 'branch') return requirePermission(false);
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    return requirePermission(
      await this.store.branch(
        actorOf(request).userId,
        parameter(request, scope.branchParam),
        scope.ownerOnly,
      ),
      true,
    );
  }
}
export class ObjectScopeGuard implements CanActivate {
  constructor(private readonly store: ScopeStore) {}
  async canActivate(context: ExecutionContext) {
    const scope = scopeOf(context);
    if (scope.kind !== 'object') return requirePermission(false);
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const resource = await this.store.object(
      actorOf(request).userId,
      parameter(request, scope.idParam),
      scope.ownerOnly,
      scope.branchParam ? parameter(request, scope.branchParam) : undefined,
    );
    if (!resource) throw new DomainError('NOT_FOUND', 404, 'Resource unavailable');
    return true;
  }
}
export class AdminGuard implements CanActivate {
  constructor(private readonly store: ScopeStore) {}
  async canActivate(context: ExecutionContext) {
    const scope = scopeOf(context);
    if (scope.kind !== 'admin') return requirePermission(false);
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const admin = await this.store.admin(actorOf(request).userId);
    // Billing is deferred by CHG-003, including for Root.
    const roles = scope.roles.filter((role) => role !== 'billing');
    return requirePermission(
      Boolean(
        admin &&
        roles.length &&
        (scope.rootOnly
          ? admin.isRoot
          : admin.isRoot || roles.some((role) => admin.roles.includes(role))),
      ),
    );
  }
}
export class StayGuard implements CanActivate {
  canActivate() {
    // ResidentStay is introduced in Phase 5. Absence never grants resident access.
    return requirePermission(false);
  }
}
export class AuthorizationGuard implements CanActivate {
  private readonly guards: Map<AccessScope['kind'], ScopeCheck>;
  constructor(private readonly store?: ScopeStore) {
    this.guards = new Map<AccessScope['kind'], ScopeCheck>([
      ['stay', new StayGuard()],
      ...(store
        ? ([
            ['owner', new OwnerGuard(store)],
            ['branch', new BranchScopeGuard(store)],
            ['object', new ObjectScopeGuard(store)],
            ['admin', new AdminGuard(store)],
          ] as [AccessScope['kind'], ScopeCheck][])
        : []),
    ]);
  }
  async canActivate(context: ExecutionContext) {
    const scope = scopeOf(context);
    if (scope.kind === 'public' || scope.kind === 'self') return true;
    if (scope.kind === 'customer') {
      const request = context.switchToHttp().getRequest<FastifyRequest>();
      return requirePermission(Boolean(await this.store?.customer(actorOf(request).userId)));
    }
    const guard = this.guards.get(scope.kind);
    if (!guard) return requirePermission(false);
    return guard.canActivate(context);
  }
}
