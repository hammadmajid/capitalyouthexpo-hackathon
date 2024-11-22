import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { DomainError } from '@hsm/contracts';
import type { ScopeStore } from '../../src/authorization/store.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { AuthTransport } from '../../src/auth/transport.js';
import type { SessionService } from '../../src/auth/session.service.js';
import { parseEnvironment } from '../../src/config.js';
import { testKeys } from '../keys.js';
export const ids = {
  branchA: randomUUID(),
  branchB: randomUUID(),
  orgA: randomUUID(),
  orgB: randomUUID(),
  objectA: randomUUID(),
  objectB: randomUUID(),
};
export const actorNames = [
  'customer',
  'owner',
  'managerA',
  'managerB',
  'root',
  'verification',
  'support',
  'content',
  'billing',
  'multi',
] as const;
export const scopes: ScopeStore = {
  customer: vi.fn<ScopeStore['customer']>(async (user) => user === 'customer' || user === 'multi'),
  owner: vi.fn<ScopeStore['owner']>(
    async (user, organization) =>
      ['owner', 'multi'].includes(user) && (!organization || organization === ids.orgA),
  ),
  branch: vi.fn<ScopeStore['branch']>(async (user, branch, ownerOnly) => {
    if (![ids.branchA, ids.branchB].some((id) => id === branch)) return false;
    if (['owner', 'multi'].includes(user)) return true;
    return (
      !ownerOnly &&
      ((user === 'managerA' && branch === ids.branchA) ||
        (user === 'managerB' && branch === ids.branchB))
    );
  }),
  object: vi.fn<ScopeStore['object']>(async (user, object, ownerOnly, branch) => {
    const resolved =
      object === ids.objectA ? ids.branchA : object === ids.objectB ? ids.branchB : undefined;
    if (
      !resolved ||
      (branch && branch !== resolved) ||
      !(await scopes.branch(user, resolved, ownerOnly))
    )
      return undefined;
    return { branchId: resolved };
  }),
  admin: vi.fn<ScopeStore['admin']>(async (user) => {
    if (user === 'root') return { isRoot: true, roles: [] };
    if (user === 'verification') return { isRoot: false, roles: ['verification'] };
    if (user === 'support') return { isRoot: false, roles: ['support'] };
    if (user === 'content') return { isRoot: false, roles: ['content_moderator'] };
    if (user === 'billing') return { isRoot: false, roles: ['billing'] };
    return undefined;
  }),
};
const crypto = new AuthCrypto(testKeys());
export const authentication = {
  transport: new AuthTransport(crypto, false),
  sessions: {
    authenticate: vi.fn(async (token: string) => {
      if (!actorNames.some((name) => name === token))
        throw new DomainError('UNAUTHENTICATED', 401, 'Authentication required');
      return { userId: token, sessionId: randomUUID() };
    }),
  } as unknown as SessionService,
  scopes,
};
export const config = parseEnvironment({
  ...testKeys(),
  APP_ENV: 'test',
  DATABASE_URL: 'postgres://localhost/test',
  REDIS_URL: 'redis://localhost',
  CORS_ORIGINS: 'http://localhost:3000',
  LOG_LEVEL: 'silent',
});
export const infrastructure = {
  postgres: async () => undefined,
  redis: async () => undefined,
  increment: async () => 1,
  close: async () => undefined,
};
