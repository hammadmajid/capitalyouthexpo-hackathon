import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { branches, lockInventoryBranch, rooms, roomTypes, seats } from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { lockPublicInventory } from './quote.js';
vi.mock('@hsm/db', async (original) => ({
  ...(await original<typeof import('@hsm/db')>()),
  lockInventoryBranch: vi.fn(),
}));
const branchId = randomUUID(),
  roomId = randomUUID(),
  bedId = randomUUID(),
  typeId = randomUUID();
const input = {
  target: { kind: 'bed' as const, roomId, bedId },
  range: { moveInDate: '2026-11-01', moveOutDate: '2026-11-03' },
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(lockInventoryBranch).mockResolvedValue({
    branch: {
      id: branchId,
      name: 'Branch',
      verificationStatus: 'approved',
      listingHiddenAt: null,
      archivedAt: null,
    },
    brand: { id: randomUUID(), name: 'Hostel', archivedAt: null },
    organization: { id: randomUUID(), archivedAt: null },
  } as Awaited<ReturnType<typeof lockInventoryBranch>>);
});
it('ACC-002 / BKG-001: inactive city is denied before physical inventory locks', async () => {
  const store = queryFixture();
  store.enqueue(branches, []);
  await expect(lockPublicInventory(store.transaction, branchId, input)).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  expect(lockInventoryBranch).not.toHaveBeenCalled();
  expect(store.locks).toHaveLength(0);
});
it('ACC-002 / BKG-001: publication revoked while waiting for branch locks is denied', async () => {
  const store = queryFixture();
  store.enqueue(branches, [{ id: branchId }], []);
  await expect(lockPublicInventory(store.transaction, branchId, input)).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  expect(lockInventoryBranch).toHaveBeenCalledTimes(1);
  expect(store.locks).toEqual([{ table: branches, mode: 'share' }]);
});
it('BKG-001: active city remains shared-locked before physical inventory mutation locks', async () => {
  const store = queryFixture();
  store.enqueue(branches, [{ id: branchId }], [{ id: branchId }]);
  store.enqueue(rooms, [{ id: roomId, roomTypeId: typeId }]);
  store.enqueue(roomTypes, [{ id: typeId, inventoryMode: 'per_bed' }]);
  store.enqueue(seats, [{ id: bedId, ordinal: 1 }]);
  await expect(lockPublicInventory(store.transaction, branchId, input)).resolves.toHaveProperty(
    'seat.id',
    bedId,
  );
  expect(store.locks).toEqual([
    { table: branches, mode: 'share' },
    { table: rooms, mode: 'update' },
    { table: roomTypes, mode: 'update' },
    { table: seats, mode: 'update' },
  ]);
});
