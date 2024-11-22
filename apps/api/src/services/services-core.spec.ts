import { beforeEach, expect, it, vi } from 'vitest';
import {
  branchMenus,
  managerAssignments,
  menuItems,
  notificationOutbox,
  organizations,
  stays,
  transportRoutes,
  transportSubscriptions,
} from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { lockInventoryScope } from '../inventory/scope.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockOwnStay, lockStaffScope, replayAuthorizer } from './scope.js';
import { requirePublicBranch } from './public-branch.js';
import { branchOwner, notify } from './notify.js';
import { MenuService } from './menu.service.js';
import { TransportRouteService } from './transport-routes.service.js';
import { replay } from './http.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('../inventory/scope.js', () => ({ lockInventoryScope: vi.fn() }));
vi.mock('../idempotency/context.js', () => ({ requireTransaction: () => current }));
let current: unknown;
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actor = { userId: id(9), sessionId: id(8), role: 'customer' } as never;
const now = new Date('2026-10-26T10:00:00Z');
const clock = () => now;
function idempotency() {
  return {
    execute: vi.fn(async (_c, _s, _i, schema, authorize, work) => {
      await authorize(current);
      return { status: 200, replayed: false, body: schema.parse(await work()) };
    }),
  } as never;
}
beforeEach(() => {
  vi.mocked(lockInventoryScope)
    .mockReset()
    .mockResolvedValue({
      organizationId: id(1),
      brandId: id(2),
      ownerId: id(9),
      actorRole: 'owner',
    } as never);
});
it('SEC-001: staff scope proves every grant; own Stay needs the linked account and an open state', async () => {
  const store = queryFixture();
  expect(
    await lockStaffScope(store.transaction, actor, id(3), ['listing_edit', 'pricing_edit'], clock),
  ).toEqual({
    organizationId: id(1),
    branchId: id(3),
    actorUserId: id(9),
    actorRole: 'owner',
  });
  expect(vi.mocked(lockInventoryScope).mock.calls.map((call) => call[3])).toEqual([
    'listing_edit',
    'pricing_edit',
  ]);
  vi.mocked(lockInventoryScope).mockResolvedValueOnce({
    organizationId: id(1),
    actorRole: 'manager',
  } as never);
  expect((await lockStaffScope(store.transaction, actor, id(3), [], clock)).actorRole).toBe(
    'manager',
  );
  store.enqueue(
    stays,
    [{ id: id(4), branchId: id(3), state: 'active' }],
    [],
    [{ id: id(4), state: 'completed' }],
    [{ id: id(4), state: 'completed' }],
  );
  expect((await lockOwnStay(store.transaction, actor, id(4), clock, true)).stay.id).toBe(id(4));
  await expect(lockOwnStay(store.transaction, actor, id(4), clock, true)).rejects.toMatchObject({
    status: 404,
  });
  await expect(lockOwnStay(store.transaction, actor, id(4), clock, true)).rejects.toMatchObject({
    status: 403,
  });
  expect((await lockOwnStay(store.transaction, actor, id(4), clock, false)).place).toBeNull();
  store.enqueue(stays, [{ id: id(4), state: 'active' }]);
  await replayAuthorizer(actor, clock, { branch: id(3) })(store.transaction);
  await replayAuthorizer(actor, clock, { stay: id(4) })(store.transaction);
  await replayAuthorizer(actor, clock, { review: id(5) })(store.transaction);
  expect(lockActor).toHaveBeenCalled();
});
it('BR-05 / NTF-001: public reads need a published listing; notices are deduplicated', async () => {
  const store = queryFixture();
  store.enqueue(organizations, [{ ownerId: id(9) }], []);
  await expect(requirePublicBranch(store.transaction, id(3))).rejects.toMatchObject({
    status: 404,
  });
  store.operations.length = 0;
  const branches = queryFixture();
  await expect(requirePublicBranch(branches.transaction, id(3))).rejects.toMatchObject({
    status: 404,
  });
  await notify(store.transaction, id(9), 'resident.complaint_updated', id(5), now);
  expect(store.writes.find((row) => row.table === notificationOutbox)?.value).toMatchObject({
    dedupeKey: 'in_app:' + id(9) + ':resident.complaint_updated:' + id(5),
  });
  const owners = queryFixture();
  expect(await branchOwner(owners.transaction, id(3))).toBeNull();
  const reply = { code: vi.fn().mockReturnThis(), header: vi.fn().mockReturnThis() };
  expect(replay(reply as never, { status: 201, replayed: true, body: 'b' })).toBe('b');
  expect(reply.header).toHaveBeenCalledWith('Idempotency-Replayed', 'true');
});
it('SERV-001: menu replace checks the version, audits, and reads resident/public scopes', async () => {
  const store = queryFixture();
  current = store.transaction;
  const service = new MenuService(store.database, idempotency(), clock);
  store.enqueue(branchMenus, [], [], [], [], [{ branchId: id(3), version: 1, updatedAt: now }]);
  store.enqueue(menuItems, [], [], [{ dayOfWeek: 1, meal: 'lunch', description: 'Daal' }]);
  expect(await service.staffRead(actor, id(3))).toMatchObject({ version: 0, items: [] });
  const saved = await service.update(actor, id(7), id(3), {
    expectedVersion: 0,
    items: [{ dayOfWeek: 1, meal: 'lunch', description: 'Daal' }],
  });
  expect(saved).toMatchObject({
    status: 200,
    body: { version: 1, items: [{ description: 'Daal' }] },
  });
  expect(store.writes.some((row) => row.table === branchMenus && row.kind === 'insert')).toBe(true);
  store.enqueue(branchMenus, [{ branchId: id(3), version: 3, updatedAt: now }]);
  await expect(
    service.update(actor, id(7), id(3), { expectedVersion: 1, items: [] }),
  ).rejects.toMatchObject({ status: 409 });
  const v1 = { branchId: id(3), version: 1, updatedAt: now };
  store.enqueue(branchMenus, [v1], [v1], [], [{ ...v1, version: 2 }]);
  store.enqueue(menuItems, [], [], []);
  expect(
    (await service.update(actor, id(7), id(3), { expectedVersion: 1, items: [] })).body.version,
  ).toBe(2);
  store.enqueue(stays, [{ id: id(4), branchId: id(3), state: 'active' }]);
  expect((await service.ownRead(actor, id(4))).version).toBe(0);
  await expect(service.publicRead(id(3))).rejects.toMatchObject({ status: 404 });
});
it('SERV-002: routes are created and edited by version; riders block retirement', async () => {
  const store = queryFixture();
  current = store.transaction;
  const service = new TransportRouteService(store.database, idempotency(), clock);
  const row = {
    id: id(5),
    branchId: id(3),
    name: 'R',
    description: null,
    monthlyChargePaisa: 100n,
    departureTimes: ['07:00'],
    stops: ['A'],
    stopRoles: [],
    pricingMode: 'separate',
    includedFrom: null,
    status: 'active',
    version: 1,
  };
  store.enqueue(
    transportRoutes,
    [row],
    [],
    [row],
    [row],
    [{ ...row, version: 2 }],
    [{ ...row, version: 3 }],
    [row],
  );
  expect((await service.staffList(actor, id(3))).data).toHaveLength(1);
  const input = { name: 'R', monthlyChargePaisa: 100, departureTimes: ['07:00'], stops: ['A'] };
  expect((await service.create(actor, id(7), id(3), input)).body.id).toBe(id(5));
  expect(
    (
      await service.update(actor, id(7), id(3), id(5), {
        ...input,
        expectedVersion: 1,
        status: 'active',
      })
    ).body.version,
  ).toBe(2);
  await expect(
    service.update(actor, id(7), id(3), id(5), { ...input, expectedVersion: 1, status: 'active' }),
  ).rejects.toMatchObject({ status: 409 });
  store.enqueue(transportSubscriptions, [{ id: id(6) }]);
  await expect(
    service.update(actor, id(7), id(3), id(5), {
      ...input,
      expectedVersion: 1,
      status: 'inactive',
    }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    service.update(actor, id(7), id(3), id(5), { ...input, expectedVersion: 1, status: 'active' }),
  ).rejects.toMatchObject({ status: 404 });
  store.enqueue(stays, [{ id: id(4), branchId: id(3), state: 'active' }]);
  expect((await service.ownList(actor, id(4))).data).toEqual([]);
  await expect(service.publicList(id(3))).rejects.toMatchObject({ status: 404 });
  store.enqueue(transportRoutes, []);
  await expect(service.create(actor, id(7), id(3), input)).rejects.toMatchObject({ status: 500 });
  void managerAssignments;
});
