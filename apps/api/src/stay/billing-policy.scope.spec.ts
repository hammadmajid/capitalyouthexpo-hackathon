import { beforeEach, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { roomTypes } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import {
  billingActor as actor,
  billingIds as ids,
  billingNow as now,
  billingScope as scope,
} from '../../test/unit/billing-policy.fixture.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
import {
  billingSettingsScope,
  billingLineageScope,
  localBillingScope,
} from './billing-policy.scope.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('../inventory/scope.js', () => ({ lockInventoryScope: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(lockInventoryScope).mockResolvedValue(scope);
});
it('ACC-004 / RENT-003: Owner-only writes reuse live session and branch authority, not a policy role flag', async () => {
  const store = queryFixture(),
    clock = () => now;
  expect(
    await billingSettingsScope(store.transaction, actor, { branchId: ids.branch }, clock, true),
  ).toEqual(scope);
  expect(lockInventoryScope).toHaveBeenCalledWith(
    store.transaction,
    actor,
    ids.branch,
    undefined,
    true,
  );
  expect(lockActor).toHaveBeenCalledTimes(2);
});
it('ACC-004: default read still requires actual branch membership and exact non-archived child', async () => {
  const store = queryFixture();
  store.enqueue(roomTypes, [{ id: ids.type }]);
  await billingSettingsScope(
    store.transaction,
    actor,
    { branchId: ids.branch, roomTypeId: ids.type },
    () => now,
  );
  expect(lockInventoryScope).toHaveBeenCalledWith(
    store.transaction,
    actor,
    ids.branch,
    undefined,
    false,
  );
  const condition = store.predicates.find((row) => row.table === roomTypes);
  expect(condition).toBeDefined();
  if (!condition) throw new Error('Expected scoped room-type predicate');
  const query = new PgDialect().sqlToQuery(condition.value);
  expect(query.params).toContain(ids.type);
  expect(query.params).toContain(ids.branch);
  expect(query.sql).toContain('"archived_at" is null');
  expect(store.locks).toContainEqual({ table: roomTypes, mode: 'update' });
});
it('ACC-004: a guessed child and revoked branch authority fail closed', async () => {
  const store = queryFixture();
  await expect(
    billingSettingsScope(
      store.transaction,
      actor,
      { branchId: ids.branch, roomTypeId: ids.type },
      () => now,
    ),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  vi.mocked(lockInventoryScope).mockRejectedValueOnce(
    new DomainError('BRANCH_FORBIDDEN', 403, 'Denied'),
  );
  await expect(
    billingSettingsScope(store.transaction, actor, { branchId: ids.branch }, () => now, true),
  ).rejects.toMatchObject({ code: 'BRANCH_FORBIDDEN' });
});
it.each([undefined, ids.type])(
  'ACC-004: fixed-size lineage and local predicates bind branch/type %s',
  (roomTypeId) => {
    const target = { branchId: ids.branch, ...(roomTypeId ? { roomTypeId } : {}) };
    const dialect = new PgDialect();
    const localCondition = localBillingScope(target);
    const lineageCondition = billingLineageScope(target, ids.brand);
    if (!localCondition || !lineageCondition) throw new Error('Expected scoped policy predicates');
    const local = dialect.sqlToQuery(localCondition);
    const lineage = dialect.sqlToQuery(lineageCondition);
    expect(local.params).toContain(ids.branch);
    expect(lineage.params).toContain(ids.brand);
    expect(lineage.params).toContain(ids.branch);
    if (roomTypeId) {
      expect(local.params).toContain(roomTypeId);
      expect(lineage.params).toContain(roomTypeId);
    } else {
      expect(local.sql).toContain('"room_type_id" is null');
      expect(lineage.params).not.toContain(ids.type);
    }
  },
);
