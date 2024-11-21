import { beforeEach, expect, it, vi } from 'vitest';
import {
  adminAccounts,
  adminRoleGrants,
  branches,
  organizations,
  reports,
  reviews,
  users,
} from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { lockAdmin, lockRootChanges, platformAudit } from './scope.js';
import { AdminAccountService } from './admins.service.js';
import { GovernanceService } from './governance.service.js';
import { PlatformAdminController } from './admin.controller.js';
import { insights, platformAdmin } from './factory.js';
import type { IdempotencyStore } from '../idempotency/store.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('../idempotency/context.js', () => ({ requireTransaction: () => current }));
vi.mock('../access.js', async (original) => ({
  ...(await original<typeof import('../access.js')>()),
  actorOf: () => ({ userId: '10000000-0000-4000-8000-000000000009' }),
}));
let current: ReturnType<typeof queryFixture>['transaction'];
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actor = { userId: id(9) } as never;
const now = new Date('2026-10-26T10:00:00Z');
const clock = () => now;
const executeIdempotency = vi.fn(async (_c, _s, _i, schema, authorize, work) => {
  await authorize(current);
  return { status: 200, replayed: false, body: schema.parse(await work()) };
});
const idempotency = {
  execute: executeIdempotency,
  // Exercise the real scoped repository's pre-actor lock hook; retain all existing assertions.
  withStore: (repository: IdempotencyStore) => ({
    execute: (...args: Parameters<typeof executeIdempotency>) =>
      repository.transaction(actor, now, () => executeIdempotency(...args)),
  }),
} as never;
const root = { isRoot: true, status: 'active' };
let store: ReturnType<typeof queryFixture>;
beforeEach(() => {
  store = queryFixture();
  current = store.transaction;
  (store.transaction as unknown as { execute: unknown }).execute = vi.fn();
});
// lockAdmin reads the account then the grants; queue both per call.
function asAdmin(account: Record<string, unknown> | undefined, roles: string[] = []) {
  store.enqueue(adminAccounts, account ? [account] : []);
  if (account)
    store.enqueue(
      adminRoleGrants,
      roles.map((role) => ({ role })),
    );
}
it('ADM-001: role checks, Root override, inactive refusal, root lock and audit row', async () => {
  asAdmin({ isRoot: false, status: 'active' }, ['support', 'billing']);
  expect(await lockAdmin(store.transaction, actor, 'support', clock)).toMatchObject({
    isRoot: false,
    roles: ['support'],
  });
  asAdmin({ isRoot: false, status: 'active' }, ['support']);
  await expect(lockAdmin(store.transaction, actor, 'verification', clock)).rejects.toMatchObject({
    status: 403,
  });
  asAdmin({ isRoot: false, status: 'active' }, ['support']);
  await expect(lockAdmin(store.transaction, actor, 'root', clock)).rejects.toMatchObject({
    status: 403,
  });
  asAdmin(root);
  expect((await lockAdmin(store.transaction, actor, 'content_moderator', clock)).isRoot).toBe(true);
  asAdmin({ isRoot: true, status: 'suspended' });
  await expect(lockAdmin(store.transaction, actor, 'support', clock)).rejects.toMatchObject({
    status: 403,
  });
  asAdmin(undefined);
  await expect(lockAdmin(store.transaction, actor, 'support', clock)).rejects.toMatchObject({
    status: 403,
  });
  await lockRootChanges(store.transaction);
  await platformAudit(
    store.transaction,
    { userId: id(9), isRoot: false, roles: ['support'] },
    { action: 'x', targetType: 't', targetId: id(1) },
    now,
  );
  expect(store.writes.at(-1)?.value).toMatchObject({ actorRole: 'admin:support', before: null });
});
const account = (change: Record<string, unknown> = {}) => ({
  userId: id(5),
  fullName: 'Sara',
  isRoot: false,
  status: 'active',
  ...change,
});
it('ADM-002..006: invite, accept, roles, status and Root cap are enforced', async () => {
  const service = new AdminAccountService(store.database, idempotency, clock);
  // list
  asAdmin(root);
  store.enqueue(adminAccounts, [{ userId: id(5) }], [account()]);
  store.enqueue(adminRoleGrants, [{ role: 'support' }, { role: 'billing' }]);
  expect((await service.list(actor)).data[0]).toMatchObject({ roles: ['support'] });
  // invite: replay authorize + work each lock admin
  asAdmin(root);
  asAdmin(root);
  store.enqueue(users, [{ id: id(5) }]);
  store.enqueue(adminAccounts, [account({ status: 'invited' })], [account({ status: 'invited' })]);
  store.enqueue(adminRoleGrants, [], [], [{ role: 'support' }]);
  expect(
    (await service.invite(actor, id(7), { email: 'S@x.test', roles: ['support'] })).body.status,
  ).toBe('invited');
  asAdmin(root);
  asAdmin(root);
  store.enqueue(users, []);
  await expect(
    service.invite(actor, id(7), { email: 's@x.test', roles: ['support'] }),
  ).rejects.toMatchObject({ status: 404 });
  asAdmin(root);
  asAdmin(root);
  store.enqueue(users, [{ id: id(5) }]);
  store.enqueue(adminAccounts, []);
  await expect(
    service.invite(actor, id(7), { email: 's@x.test', roles: ['support'] }),
  ).rejects.toMatchObject({ status: 409 });
  // accept
  store.enqueue(adminAccounts, [{ status: 'invited' }], [], [account()]);
  store.enqueue(adminRoleGrants, [{ role: 'support' }]);
  expect((await service.accept(actor, id(7))).body.status).toBe('active');
  store.enqueue(adminAccounts, [{ status: 'active' }]);
  await expect(service.accept(actor, id(7))).rejects.toMatchObject({ status: 404 });
  store.enqueue(adminAccounts, [account()]);
  store.enqueue(adminRoleGrants, []);
  expect((await service.me(actor)).userId).toBe(id(5));
  const change = async (
    row: Record<string, unknown>,
    roots: number,
    body: Record<string, unknown>,
    after = account(),
  ) => {
    store = queryFixture();
    current = store.transaction;
    (store.transaction as unknown as { execute: unknown }).execute = vi.fn();
    asAdmin(root);
    asAdmin(root);
    const update = body.change === 'roles' ? [] : [[]];
    store.enqueue(adminAccounts, [row], [after], [{ count: roots }], ...update, [after]);
    store.enqueue(adminRoleGrants, [], [], [], [], []);
    return new AdminAccountService(store.database, idempotency, clock).change(
      actor,
      id(7),
      id(5),
      body,
    );
  };
  expect(
    (
      await change({ isRoot: false, status: 'active' }, 1, {
        change: 'roles',
        roles: ['verification'],
        reason: 'r',
      })
    ).body.userId,
  ).toBe(id(5));
  await expect(
    change({ isRoot: true, status: 'active' }, 2, {
      change: 'roles',
      roles: ['support'],
      reason: 'r',
    }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    change({ isRoot: true, status: 'active' }, 1, {
      change: 'status',
      status: 'suspended',
      reason: 'r',
    }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    change({ isRoot: true, status: 'suspended' }, 3, {
      change: 'status',
      status: 'active',
      reason: 'r',
    }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    change({ isRoot: false, status: 'deactivated' }, 1, {
      change: 'status',
      status: 'active',
      reason: 'r',
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (
      await change({ isRoot: false, status: 'active' }, 1, {
        change: 'status',
        status: 'suspended',
        reason: 'r',
      })
    ).status,
  ).toBe(200);
  await expect(
    change({ isRoot: false, status: 'active' }, 1, { change: 'root', isRoot: false, reason: 'r' }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    change({ isRoot: false, status: 'active' }, 3, { change: 'root', isRoot: true, reason: 'r' }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    change({ isRoot: true, status: 'active' }, 1, { change: 'root', isRoot: false, reason: 'r' }),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (
      await change({ isRoot: false, status: 'active' }, 2, {
        change: 'root',
        isRoot: true,
        reason: 'r',
      })
    ).status,
  ).toBe(200);
  asAdmin(root);
  asAdmin(root);
  store.enqueue(adminAccounts, []);
  await expect(
    service.change(actor, id(7), id(5), { change: 'root', isRoot: true, reason: 'r' }),
  ).rejects.toMatchObject({ status: 404 });
  store.enqueue(adminAccounts, []);
  await expect(service.me(actor)).rejects.toMatchObject({ status: 404 });
});
it('ADM-007/008: verification moves, moderation with reasons and report dismissal', async () => {
  const service = new GovernanceService(store.database, idempotency, clock);
  const verifier = () => {
    asAdmin({ isRoot: false, status: 'active' }, ['verification']);
    asAdmin({ isRoot: false, status: 'active' }, ['verification']);
  };
  asAdmin({ isRoot: false, status: 'active' }, ['verification']);
  store.enqueue(branches, [
    {
      branchId: id(3),
      branchName: 'B',
      organizationName: 'O',
      status: 'submitted',
      updatedAt: now,
    },
    {
      branchId: id(4),
      branchName: 'C',
      organizationName: 'O',
      status: 'submitted',
      updatedAt: now,
    },
  ]);
  expect((await service.verificationQueue(actor, { limit: '1' })).nextCursor).toBe(id(3));
  verifier();
  store.enqueue(branches, [
    { id: id(3), name: 'B', organizationId: id(1), verificationStatus: 'submitted' },
  ]);
  store.enqueue(organizations, [{ name: 'O', ownerId: id(1) }]);
  expect(
    (await service.decideVerification(actor, id(7), id(3), { action: 'approve' })).body.status,
  ).toBe('approved');
  verifier();
  store.enqueue(branches, [{ id: id(3), verificationStatus: 'submitted' }]);
  await expect(
    service.decideVerification(actor, id(7), id(3), { action: 'reject' }),
  ).rejects.toMatchObject({ status: 400 });
  verifier();
  store.enqueue(branches, [{ id: id(3), verificationStatus: 'draft' }]);
  await expect(
    service.decideVerification(actor, id(7), id(3), { action: 'approve' }),
  ).rejects.toMatchObject({ status: 409 });
  verifier();
  store.enqueue(branches, []);
  await expect(
    service.decideVerification(actor, id(7), id(3), { action: 'approve' }),
  ).rejects.toMatchObject({ status: 404 });
  const moderator = () => {
    asAdmin({ isRoot: false, status: 'active' }, ['content_moderator']);
    asAdmin({ isRoot: false, status: 'active' }, ['content_moderator']);
  };
  asAdmin({ isRoot: false, status: 'active' }, ['content_moderator']);
  const review = { id: id(6), branchId: id(3), status: 'published', body: 'x', version: 1 };
  store.enqueue(reports, [
    {
      report: { id: id(2), reason: 'spam', details: null, status: 'open', createdAt: now },
      review,
    },
  ]);
  expect((await service.reviewReports(actor, {})).data[0]).toMatchObject({ reviewId: id(6) });
  moderator();
  store.enqueue(reviews, [review]);
  store.enqueue(reports, [{ id: id(2), targetType: 'review', targetId: id(6), status: 'open' }]);
  expect(
    (
      await service.moderateReview(actor, id(7), id(6), {
        action: 'hide',
        expectedVersion: 1,
        reason: 'Spam',
        reportId: id(2),
      })
    ).body.status,
  ).toBe('hidden');
  moderator();
  store.enqueue(reviews, [{ ...review, status: 'hidden', version: 2 }]);
  expect(
    (
      await service.moderateReview(actor, id(7), id(6), {
        action: 'restore',
        expectedVersion: 2,
        reason: 'Fixed',
      })
    ).body.status,
  ).toBe('published');
  moderator();
  store.enqueue(reviews, [review]);
  await expect(
    service.moderateReview(actor, id(7), id(6), {
      action: 'restore',
      expectedVersion: 1,
      reason: 'x',
    }),
  ).rejects.toMatchObject({ status: 409 });
  moderator();
  store.enqueue(reviews, [{ ...review, version: 4 }]);
  await expect(
    service.moderateReview(actor, id(7), id(6), {
      action: 'remove',
      expectedVersion: 1,
      reason: 'x',
    }),
  ).rejects.toMatchObject({ status: 409 });
  moderator();
  store.enqueue(reviews, []);
  await expect(
    service.moderateReview(actor, id(7), id(6), {
      action: 'remove',
      expectedVersion: 1,
      reason: 'x',
    }),
  ).rejects.toMatchObject({ status: 404 });
  moderator();
  store.enqueue(reports, [{ id: id(2), status: 'open', targetId: id(6) }]);
  expect(
    (await service.dismissReport(actor, id(7), id(2), { reason: 'Fair criticism' })).body.status,
  ).toBe('dismissed');
  moderator();
  store.enqueue(reports, [{ id: id(2), status: 'dismissed', targetId: id(6) }]);
  await expect(service.dismissReport(actor, id(7), id(2), { reason: 'x' })).rejects.toMatchObject({
    status: 409,
  });
  moderator();
  store.enqueue(reports, []);
  await expect(service.dismissReport(actor, id(7), id(2), { reason: 'x' })).rejects.toMatchObject({
    status: 404,
  });
});
it('Phase 10 admin controller delegates every route; factories wire the services', async () => {
  const envelope = { status: 200, replayed: false, body: 'b' };
  const mocked = () => new Proxy({}, { get: () => vi.fn().mockResolvedValue(envelope) }) as never;
  const reply = { code: vi.fn().mockReturnThis(), header: vi.fn().mockReturnThis() } as never;
  const request = { headers: { 'idempotency-key': id(7) } } as never;
  const controller = new PlatformAdminController({
    admins: mocked(),
    governance: mocked(),
    support: mocked(),
  });
  const proto = Object.getPrototypeOf(controller) as Record<
    string,
    (...args: unknown[]) => Promise<unknown>
  >;
  const names = Object.getOwnPropertyNames(proto).filter((name) => name !== 'constructor');
  for (const name of names) {
    const method = proto[name];
    if (!method) continue;
    const args = method.toString().includes('replay')
      ? [request, reply, id(1), {}]
      : [request, id(1), {}];
    await method.apply(controller, args);
  }
  expect(names.length).toBeGreaterThan(18);
  expect(Object.keys(platformAdmin(store.database, idempotency))).toEqual([
    'admins',
    'governance',
    'support',
  ]);
  expect(Object.keys(insights(store.database))).toEqual(['dashboards', 'reports']);
});
