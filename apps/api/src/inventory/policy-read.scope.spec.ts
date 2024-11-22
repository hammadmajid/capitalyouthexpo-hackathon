import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { adminAccounts, roomTypes } from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { ScopeRepository } from '../authorization/repository.js';
import { lockSetupScope } from '../management/hostel-setup.scope.js';
import { lockInventoryScope } from './scope.js';
import { inventoryPermissions } from './permissions.js';
import { policyReadScope } from './policy-read.scope.js';
vi.mock('../management/hostel-setup.scope.js', () => ({ lockSetupScope: vi.fn() }));
vi.mock('./scope.js', () => ({ lockInventoryScope: vi.fn() }));
vi.mock('./permissions.js', () => ({ inventoryPermissions: vi.fn() }));
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  brandId = randomUUID(),
  branchId = randomUUID(),
  typeId = randomUUID();
const admin = vi.spyOn(ScopeRepository.prototype, 'admin');
beforeEach(() => {
  vi.resetAllMocks();
  admin.mockResolvedValue({ isRoot: true, roles: [] });
  vi.mocked(lockInventoryScope).mockResolvedValue({
    organizationId: randomUUID(),
    brandId,
    ownerId: randomUUID(),
    actorRole: 'manager',
  });
  vi.mocked(inventoryPermissions).mockResolvedValue({
    permissions: [],
    canConfigureManagers: false,
  });
});
it('ACC-004: Owner hostel reads use live owned setup scope', async () => {
  const store = queryFixture();
  expect(await policyReadScope(store.transaction, actor, { level: 'hostel', id: brandId })).toEqual(
    { brandId, branchId: null, typeId: null, canEdit: true },
  );
  expect(lockSetupScope).toHaveBeenCalledWith(store.transaction, actor, {
    kind: 'brand',
    id: brandId,
  });
});
it.each([false, true])(
  'ACC-004: assigned Managers may read; policy_edit grant controls canEdit=%s',
  async (grant) => {
    const store = queryFixture();
    vi.mocked(inventoryPermissions).mockResolvedValue({
      permissions: grant ? ['policy_edit'] : [],
      canConfigureManagers: false,
    });
    expect(
      await policyReadScope(store.transaction, actor, { level: 'branch', id: branchId }),
    ).toMatchObject({ branchId, canEdit: grant });
    expect(lockInventoryScope).toHaveBeenCalledWith(store.transaction, actor, branchId);
  },
);
it('ACC-004: room type reads require an active exact-branch row', async () => {
  const store = queryFixture();
  store.enqueue(roomTypes, [{ id: typeId }]);
  expect(
    await policyReadScope(store.transaction, actor, { level: 'room_type', id: typeId, branchId }),
  ).toMatchObject({ typeId });
  const predicate = store.predicates[0];
  if (!predicate) throw new Error('Expected scope predicate');
  const query = new PgDialect().sqlToQuery(predicate.value);
  expect(query.params).toEqual([typeId, branchId]);
  expect(query.sql).toContain('archived_at');
  expect(store.locks).toContainEqual({ table: roomTypes, mode: 'share' });
});
it('ACC-004: a missing or foreign room type fails closed', async () => {
  const store = queryFixture();
  await expect(
    policyReadScope(store.transaction, actor, { level: 'room_type', id: typeId, branchId }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(inventoryPermissions).not.toHaveBeenCalled();
});
it('ACC-004: room type policy reads cannot omit their branch', async () => {
  const store = queryFixture();
  await expect(
    policyReadScope(store.transaction, actor, { level: 'room_type', id: typeId }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(lockInventoryScope).not.toHaveBeenCalled();
});
it('ACC-004: Root read locks an active Root account and rechecks live capability', async () => {
  const store = queryFixture();
  store.enqueue(adminAccounts, [{ id: actor.userId }]);
  expect(await policyReadScope(store.transaction, actor, { level: 'platform' })).toEqual({
    brandId: null,
    branchId: null,
    typeId: null,
    canEdit: true,
  });
  expect(store.locks).toContainEqual({ table: adminAccounts, mode: 'share' });
  expect(admin).toHaveBeenCalledWith(actor.userId);
});
it.each(['missing-row', 'missing-role', 'ordinary-admin'])(
  'ACC-004: Root policy rejects %s',
  async (kind) => {
    const store = queryFixture();
    if (kind !== 'missing-row') store.enqueue(adminAccounts, [{ id: actor.userId }]);
    if (kind === 'missing-role') admin.mockResolvedValue(undefined);
    if (kind === 'ordinary-admin')
      admin.mockResolvedValue({ isRoot: false, roles: ['verification'] });
    await expect(
      policyReadScope(store.transaction, actor, { level: 'platform' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  },
);

it('ACC-004: owning Owner can edit branch policy without a Manager grant', async () => {
  const store = queryFixture();
  vi.mocked(lockInventoryScope).mockResolvedValue({
    organizationId: randomUUID(),
    brandId,
    ownerId: actor.userId,
    actorRole: 'owner',
  });
  vi.mocked(inventoryPermissions).mockResolvedValue({
    permissions: ['policy_edit'],
    canConfigureManagers: true,
  });
  expect(
    await policyReadScope(store.transaction, actor, { level: 'branch', id: branchId }),
  ).toMatchObject({ canEdit: true });
  expect(inventoryPermissions).toHaveBeenCalledWith(store.transaction, actor, branchId, true);
});
