import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { roomTypePrices, roomTypes } from '@hsm/db';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from './scope.js';
import { AuditWriter } from '../audit/writer.js';
import { InventoryPricingRepository } from './pricing.repository.js';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { pageType } from '../../test/unit/inventory-pages.fixture.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('./scope.js', () => ({ lockInventoryScope: vi.fn() }));
const type = pageType(),
  actor = { userId: randomUUID(), sessionId: randomUUID() },
  now = new Date('2026-10-25T10:00:00Z');
const input = {
  effectiveFrom: '2026-11-01',
  bedMonthlyRentPaisa: 1800001,
  roomMonthlyRentPaisa: 3200000,
  depositPaisa: 0,
  fees: [],
};
const version = {
  id: randomUUID(),
  branchId: type.branchId,
  roomTypeId: type.id,
  effectiveFrom: input.effectiveFrom,
  bedMonthlyRentPaisa: 1800001n,
  roomMonthlyRentPaisa: 3200000n,
  depositPaisa: 0n,
  fees: [],
  createdByUserId: actor.userId,
  createdAt: now,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(lockInventoryScope).mockResolvedValue({
    ownerId: actor.userId,
    organizationId: randomUUID(),
    brandId: randomUUID(),
    actorRole: 'owner',
  });
});
function fixture() {
  const store = queryFixture(),
    record = vi.fn().mockResolvedValue(undefined),
    audit = Object.assign(new AuditWriter(), { hostel: record });
  return {
    ...store,
    record,
    repository: new InventoryPricingRepository(store.database, audit, () => now),
  };
}
it('ACC-004: the default live clock is supplied to authority checks', async () => {
  const store = queryFixture();
  store.enqueue(roomTypes, [type]);
  vi.mocked(lockActor).mockImplementationOnce(async (_tx, _actor, clock) => {
    expect(clock()).toBeInstanceOf(Date);
  });
  expect(
    (
      await new InventoryPricingRepository(store.database).history(actor, type.branchId, type.id, {
        limit: 20,
      })
    ).data,
  ).toEqual([]);
});
it('ACC-004: live actor and branch checks precede exact-type reads; mutation needs both grants', async () => {
  const store = fixture();
  store.enqueue(roomTypes, [type]);
  await store.repository.authorize(store.transaction, actor, type.branchId, type.id, true);
  expect(lockInventoryScope).toHaveBeenNthCalledWith(
    1,
    store.transaction,
    actor,
    type.branchId,
    'inventory_edit',
  );
  expect(lockInventoryScope).toHaveBeenNthCalledWith(
    2,
    store.transaction,
    actor,
    type.branchId,
    'pricing_edit',
  );
  expect(lockActor).toHaveBeenCalled();
  await expect(
    store.repository.authorize(store.transaction, actor, type.branchId, type.id),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
it.each([
  { inventoryMode: 'both' as const, bedMonthlyRentPaisa: null, roomMonthlyRentPaisa: 1 },
  { inventoryMode: 'both' as const, bedMonthlyRentPaisa: 1, roomMonthlyRentPaisa: null },
])(
  'BKG-004: missing mode amounts do not create or audit a partial version (%j)',
  async ({ inventoryMode, ...prices }) => {
    const store = fixture();
    store.enqueue(roomTypes, [{ ...type, inventoryMode }]);
    await expect(
      store.repository.schedule(store.transaction, actor, type.branchId, type.id, {
        ...input,
        ...prices,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(store.writes).toHaveLength(0);
    expect(store.record).not.toHaveBeenCalled();
  },
);
it.each(['per_bed', 'whole_room'] as const)(
  'BKG-004: valid %s publication retains exact money, source actor/time and audit',
  async (inventoryMode) => {
    const store = fixture(),
      prices = {
        ...input,
        bedMonthlyRentPaisa: inventoryMode === 'whole_room' ? null : input.bedMonthlyRentPaisa,
        roomMonthlyRentPaisa: inventoryMode === 'per_bed' ? null : input.roomMonthlyRentPaisa,
      };
    store.enqueue(roomTypes, [{ ...type, inventoryMode }]);
    store.enqueue(roomTypePrices, [
      {
        ...version,
        bedMonthlyRentPaisa: prices.bedMonthlyRentPaisa === null ? null : 1800001n,
        roomMonthlyRentPaisa: prices.roomMonthlyRentPaisa === null ? null : 3200000n,
      },
    ]);
    const result = await store.repository.schedule(
      store.transaction,
      actor,
      type.branchId,
      type.id,
      prices,
    );
    expect(result).toMatchObject(prices);
    expect(store.record).toHaveBeenCalledWith(
      store.transaction,
      expect.objectContaining({
        actorUserId: actor.userId,
        action: 'inventory.price.schedule',
        targetId: version.id,
        after: result,
      }),
    );
  },
);
it('BKG-004: an absent inserted version fails safely before any audit response', async () => {
  const store = fixture();
  store.enqueue(roomTypes, [type]);
  await expect(
    store.repository.schedule(store.transaction, actor, type.branchId, type.id, input),
  ).rejects.toMatchObject({ code: 'INTERNAL' });
  expect(store.record).not.toHaveBeenCalled();
});
it('ACC-004: descending history bounds continuation and preserves explicit empty history', async () => {
  const store = fixture();
  store.enqueue(roomTypes, [type], [type], [type]);
  store.enqueue(
    roomTypePrices,
    [version, { ...version, id: randomUUID(), effectiveFrom: '2026-10-01' }],
    [version],
    [],
  );
  expect(
    (await store.repository.history(actor, type.branchId, type.id, { limit: 1 })).nextCursor,
  ).toBe(input.effectiveFrom);
  expect(
    (
      await store.repository.history(actor, type.branchId, type.id, {
        limit: 20,
        cursor: '2026-12-01',
      })
    ).nextCursor,
  ).toBeNull();
  expect(
    (await store.repository.history(actor, type.branchId, type.id, { limit: 20 })).data,
  ).toEqual([]);
});
