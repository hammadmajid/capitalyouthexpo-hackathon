import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { inventoryBlocks, inventoryClaims, rooms, seats, expireRoomReservations } from '@hsm/db';
import { AuditWriter } from '../audit/writer.js';
import { lockInventoryScope } from './scope.js';
import { InventoryBlockRepository } from './blocks.repository.js';
import { queryFixture } from '../../test/unit/query-fixture.js';
vi.mock('./scope.js', () => ({ lockInventoryScope: vi.fn() }));
vi.mock('@hsm/db', async (original) => ({
  ...(await original<typeof import('@hsm/db')>()),
  expireRoomReservations: vi.fn(),
}));
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  branchId = randomUUID();
const roomId = randomUUID(),
  bedId = randomUUID(),
  organizationId = randomUUID();
const now = new Date('2026-10-15T10:00:00Z');
const range = { moveInDate: '2026-11-01', moveOutDate: '2026-11-03' };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(lockInventoryScope).mockResolvedValue({
    ownerId: actor.userId,
    organizationId,
    brandId: randomUUID(),
    actorRole: 'owner',
  });
});
function fixture() {
  const store = queryFixture(),
    audit = new AuditWriter();
  const record = vi.spyOn(audit, 'hostel').mockResolvedValue(undefined);
  return {
    ...store,
    record,
    repository: new InventoryBlockRepository(store.database, audit, () => now),
  };
}
it('ACC-004: blocking requires explicit branch-scoped block permission', async () => {
  const store = fixture();
  await expect(store.repository.authorize(store.transaction, actor, branchId)).resolves.toBe(true);
  expect(lockInventoryScope).toHaveBeenCalledWith(
    store.transaction,
    actor,
    branchId,
    'block_manage',
  );
});
it('ACC-001: bed block claims the existing physical ordinal and audits its reason', async () => {
  const store = fixture();
  store.enqueue(rooms, [{ id: roomId }]);
  store.enqueue(seats, [{ id: bedId, ordinal: 4 }]);
  const result = await store.repository.create(store.transaction, actor, branchId, {
    target: { kind: 'bed', roomId, bedId },
    range,
    kind: 'maintenance',
    reason: 'Repair bed frame',
  });
  expect(store.writes.find((row) => row.table === inventoryClaims)?.value).toMatchObject({
    branchId,
    roomId,
    seatId: bedId,
    seatOrdinal: 4,
    blockId: result.id,
    expiresAt: null,
    ...range,
  });
  expect(store.record).toHaveBeenCalledWith(
    store.transaction,
    expect.objectContaining({
      action: 'inventory.block.created',
      after: expect.objectContaining({ reason: 'Repair bed frame' }),
    }),
  );
  expect(expireRoomReservations).toHaveBeenCalledWith(store.transaction, roomId, now);
});
it('ACC-001: whole-room blocks claim all physical slots via a null seat', async () => {
  const store = fixture();
  store.enqueue(rooms, [{ id: roomId }]);
  await store.repository.create(store.transaction, actor, branchId, {
    target: { kind: 'room', roomId },
    range,
    kind: 'manual',
    reason: 'Owner reservation',
  });
  expect(store.writes.find((row) => row.table === inventoryClaims)?.value).toMatchObject({
    seatId: null,
    seatOrdinal: null,
  });
  expect(store.writes.find((row) => row.table === inventoryBlocks)?.value).toMatchObject({
    reason: 1,
  });
});
it('ACC-001: an overlapping live claim prevents block creation and audit', async () => {
  const store = fixture();
  store.enqueue(rooms, [{ id: roomId }]);
  store.enqueue(inventoryClaims, [{ id: randomUUID() }]);
  await expect(
    store.repository.create(store.transaction, actor, branchId, {
      target: { kind: 'room', roomId },
      range,
      kind: 'manual',
      reason: 'Reserved',
    }),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(store.writes).toHaveLength(0);
  expect(store.record).not.toHaveBeenCalled();
});
it.each(['room', 'bed'] as const)(
  'ACC-004: absent/foreign %s cannot be blocked',
  async (target) => {
    const store = fixture();
    if (target === 'bed') store.enqueue(rooms, [{ id: roomId }]);
    await expect(
      store.repository.create(store.transaction, actor, branchId, {
        target: target === 'room' ? { kind: 'room', roomId } : { kind: 'bed', roomId, bedId },
        range,
        kind: 'manual',
        reason: 'Reserved',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(store.writes).toHaveLength(0);
  },
);
it.each([null, now])(
  'ACC-001: releasing a block preserves history and a stable release timestamp (%s)',
  async (previous) => {
    const store = fixture(),
      blockId = randomUUID();
    const block = {
      id: blockId,
      branchId,
      roomId,
      seatId: null,
      ...range,
      reason: 1,
      releasedAt: previous,
    };
    store.enqueue(inventoryBlocks, [block], [block]);
    store.enqueue(rooms, [{ id: roomId }]);
    const result = await store.repository.release(
      store.transaction,
      actor,
      branchId,
      blockId,
      'Repair complete',
    );
    expect(result.releasedAt).toBe(now.toISOString());
    expect(store.operations.some((operation) => operation.kind === 'delete')).toBe(false);
    const updates = store.writes.filter((row) => row.kind === 'update');
    expect(updates).toHaveLength(previous ? 0 : 2);
    if (!previous)
      expect(updates.find((row) => row.table === inventoryClaims)?.value).toEqual({
        releasedAt: now,
      });
    expect(store.record).toHaveBeenCalledTimes(previous ? 0 : 1);
  },
);
it('ACC-004: foreign block identifiers cannot be released', async () => {
  const store = fixture();
  await expect(
    store.repository.release(store.transaction, actor, branchId, randomUUID(), 'Done'),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(store.writes).toHaveLength(0);
});
