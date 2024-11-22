import { beforeEach, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { residentChargeCatalog } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import {
  catalogActor as actor,
  catalogIds as ids,
  catalogNow as now,
  catalogRow,
  catalogScopeFixture as scope,
} from '../../test/unit/billing-catalog.fixture.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
import { catalogScope, lockCatalogEntry } from './catalog.scope.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('../inventory/scope.js', () => ({ lockInventoryScope: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(lockInventoryScope).mockResolvedValue(scope);
});
it.each([false, true])(
  'FIN-004 / SEC-003: catalogue scope uses live actor checks around canonical permission locks; Owner-only=%s',
  async (ownerOnly) => {
    const f = queryFixture(),
      clock = () => now;
    expect(await catalogScope(f.transaction, actor, ids.branch, clock, ownerOnly)).toEqual(scope);
    expect(lockActor).toHaveBeenCalledTimes(2);
    expect(lockInventoryScope).toHaveBeenCalledWith(
      f.transaction,
      actor,
      ids.branch,
      ownerOnly ? undefined : 'finance_view',
      ownerOnly,
    );
    const before = vi.mocked(lockActor).mock.invocationCallOrder[0],
      during = vi.mocked(lockInventoryScope).mock.invocationCallOrder[0],
      after = vi.mocked(lockActor).mock.invocationCallOrder[1];
    if (before === undefined || during === undefined || after === undefined)
      throw Error('Missing authorization order');
    expect(before).toBeLessThan(during);
    expect(during).toBeLessThan(after);
  },
);
it('SEC-003: rejected initial actor never reaches hierarchy locks', async () => {
  vi.mocked(lockActor).mockRejectedValueOnce(
    new DomainError('SESSION_REVOKED', 401, 'Unavailable'),
  );
  await expect(
    catalogScope(queryFixture().transaction, actor, ids.branch, () => now),
  ).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
  expect(lockInventoryScope).not.toHaveBeenCalled();
});
it('SEC-003: expiry while waiting for scope is rejected by the final fresh actor check', async () => {
  vi.mocked(lockActor)
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new DomainError('TOKEN_EXPIRED', 401, 'Expired'));
  await expect(
    catalogScope(queryFixture().transaction, actor, ids.branch, () => now),
  ).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
});
it('ACC-004: exact catalogue child is bounded and locked with both branch and item in SQL', async () => {
  const f = queryFixture(),
    row = catalogRow();
  f.enqueue(residentChargeCatalog, [row]);
  expect(await lockCatalogEntry(f.transaction, ids.branch, ids.entry)).toEqual(row);
  expect(f.locks).toEqual([{ table: residentChargeCatalog, mode: 'update' }]);
  expect(f.operations).toContainEqual({ table: residentChargeCatalog, kind: 'limit', args: [1] });
  const predicate = f.predicates[0];
  if (!predicate) throw Error('Missing scope');
  expect(new PgDialect().sqlToQuery(predicate.value).params).toEqual([ids.branch, ids.entry]);
});
it('ACC-004: missing or hidden catalogue child is opaque404', async () => {
  await expect(
    lockCatalogEntry(queryFixture().transaction, ids.branch, ids.entry),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
it.each([
  [catalogRow(), catalogRow()],
  [catalogRow({ branchId: ids.brand })],
  [catalogRow({ id: ids.next })],
])('ACC-004: inconsistent selected catalogue scope case %# fails closed', async (...rows) => {
  const f = queryFixture();
  f.enqueue(residentChargeCatalog, rows);
  await expect(lockCatalogEntry(f.transaction, ids.branch, ids.entry)).rejects.toMatchObject({
    code: 'INTERNAL',
  });
});
