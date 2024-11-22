import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import {
  branches,
  brands,
  organizations,
  managerAssignments,
  managerInventoryGrants,
} from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { lockInventoryScope } from './scope.js';
import { inventoryPermissions } from './permissions.js';
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  branchId = randomUUID();
const organizationId = randomUUID(),
  brandId = randomUUID(),
  assignmentId = randomUUID();
function fixture(owner: boolean, missing?: 'organization' | 'brand' | 'branch') {
  const store = queryFixture();
  store.enqueue(
    branches,
    [{ organizationId, brandId, ownerId: owner ? actor.userId : randomUUID() }],
    missing === 'branch' ? [] : [{ id: branchId }],
  );
  store.enqueue(organizations, missing === 'organization' ? [] : [{ id: organizationId }]);
  store.enqueue(brands, missing === 'brand' ? [] : [{ id: brandId }]);
  return store;
}
it('ACC-004: Owner scope locks the exact live parent hierarchy before inventory writes', async () => {
  const store = fixture(true);
  expect(
    await lockInventoryScope(store.transaction, actor, branchId, 'pricing_edit'),
  ).toMatchObject({ actorRole: 'owner', organizationId, brandId });
  expect(store.locks.map((lock) => lock.table)).toEqual([organizations, brands, branches]);
  expect(store.writes).toHaveLength(0);
});
it('ACC-004: unknown branches and foreign unassigned branches are denied uniformly', async () => {
  const absent = queryFixture();
  absent.enqueue(branches, []);
  await expect(lockInventoryScope(absent.transaction, actor, branchId)).rejects.toMatchObject({
    code: 'BRANCH_FORBIDDEN',
  });
  const foreign = fixture(false);
  foreign.enqueue(managerAssignments, []);
  await expect(lockInventoryScope(foreign.transaction, actor, branchId)).rejects.toMatchObject({
    code: 'BRANCH_FORBIDDEN',
  });
  expect(foreign.writes).toHaveLength(0);
});
it('ACC-004: an assigned Manager cannot invoke an Owner-only change', async () => {
  const store = fixture(false);
  store.enqueue(managerAssignments, [{ id: assignmentId }]);
  await expect(
    lockInventoryScope(store.transaction, actor, branchId, undefined, true),
  ).rejects.toMatchObject({ code: 'BRANCH_FORBIDDEN' });
  expect(store.locks).toHaveLength(0);
});
it('ACC-004: Manager permissions are explicit and live, not implied by assignment', async () => {
  const denied = fixture(false);
  denied.enqueue(managerAssignments, [{ id: assignmentId }]);
  denied.enqueue(managerInventoryGrants, []);
  await expect(
    lockInventoryScope(denied.transaction, actor, branchId, 'pricing_edit'),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  const allowed = fixture(false);
  allowed.enqueue(managerAssignments, [{ id: assignmentId }]);
  allowed.enqueue(managerInventoryGrants, [{ permission: 'pricing_edit' }]);
  expect(
    await lockInventoryScope(allowed.transaction, actor, branchId, 'pricing_edit'),
  ).toMatchObject({ actorRole: 'manager' });
  expect(allowed.locks.map((lock) => lock.table)).toEqual([
    managerAssignments,
    organizations,
    brands,
    branches,
  ]);
  const permission = allowed.predicates.find((row) => row.table === managerInventoryGrants);
  expect(permission).toBeDefined();
  if (permission)
    expect(new PgDialect().sqlToQuery(permission.value).params).toContain('pricing_edit');
});
it.each(['organization', 'brand', 'branch'] as const)(
  'ACC-004: archived/missing %s cannot grant operational scope',
  async (missing) => {
    const store = fixture(true, missing);
    await expect(lockInventoryScope(store.transaction, actor, branchId)).rejects.toMatchObject({
      code: 'BRANCH_FORBIDDEN',
    });
  },
);
it('ACC-004: Owner capability projections expose all configured grants without reading another assignment', async () => {
  const store = queryFixture();
  const result = await inventoryPermissions(store.transaction, actor, branchId, true);
  expect(result.canConfigureManagers).toBe(true);
  expect(result.permissions).toContain('pricing_edit');
  expect(store.predicates).toHaveLength(0);
});
it('ACC-004: Manager capability projections bind actor, branch and active assignment', async () => {
  const store = queryFixture();
  store.enqueue(managerInventoryGrants, [{ permission: 'inventory_edit' }]);
  expect(await inventoryPermissions(store.transaction, actor, branchId, false)).toEqual({
    permissions: ['inventory_edit'],
    canConfigureManagers: false,
  });
  const predicate = store.predicates[0];
  if (!predicate) throw new Error('Permission predicate missing');
  const query = new PgDialect().sqlToQuery(predicate.value);
  for (const value of [actor.userId, branchId, 'active']) expect(query.params).toContain(value);
});
