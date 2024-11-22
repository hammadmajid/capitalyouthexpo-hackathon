import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { rooms, seats, roomTypes, roomTypeFees } from '@hsm/db';
import { roomTypeInputSchema } from '@hsm/contracts';
import { AuditWriter } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from './scope.js';
import { inventoryPermissions } from './permissions.js';
import { readBranchInventory } from './read.js';
import { InventoryRepository } from './repository.js';
import { queryFixture } from '../../test/unit/query-fixture.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('./scope.js', () => ({ lockInventoryScope: vi.fn() }));
vi.mock('./permissions.js', () => ({ inventoryPermissions: vi.fn() }));
vi.mock('./read.js', () => ({ readBranchInventory: vi.fn() }));
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  branchId = randomUUID();
const typeId = randomUUID(),
  roomId = randomUUID(),
  organizationId = randomUUID(),
  brandId = randomUUID();
const now = new Date('2026-10-14T12:00:00Z');
const input = roomTypeInputSchema.parse({
  name: 'Two beds',
  capacity: 2,
  inventoryMode: 'both',
  bedMonthlyRentPaisa: 1800001,
  roomMonthlyRentPaisa: 3200000,
  depositPaisa: 0,
  fees: [{ code: 'mess', cadence: 'monthly', amountPaisa: 1001 }],
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(lockInventoryScope).mockResolvedValue({
    ownerId: actor.userId,
    organizationId,
    brandId,
    actorRole: 'owner',
  });
  vi.mocked(inventoryPermissions).mockResolvedValue({
    permissions: ['inventory_edit'],
    canConfigureManagers: false,
  });
  vi.mocked(readBranchInventory).mockResolvedValue({
    roomTypes: [],
    rooms: [],
    permissions: [],
    canConfigureManagers: false,
  });
});
function fixture() {
  const store = queryFixture(),
    audit = new AuditWriter();
  const record = vi.spyOn(audit, 'hostel').mockResolvedValue(undefined);
  return {
    ...store,
    record,
    repository: new InventoryRepository(store.database, audit, () => now),
  };
}
it('ACC-004: inventory reads revalidate live actor/scope before projecting capabilities', async () => {
  const store = fixture();
  await store.repository.read(actor, branchId);
  expect(lockActor).toHaveBeenCalledWith(store.transaction, actor, expect.any(Function));
  expect(lockInventoryScope).toHaveBeenCalledWith(store.transaction, actor, branchId, undefined);
  expect(inventoryPermissions).toHaveBeenCalledWith(store.transaction, actor, branchId, true);
});
it('BKG-003/004: room types persist exact integer paisa and controlled fees with a scoped audit', async () => {
  const store = fixture();
  const result = await store.repository.roomType(store.transaction, actor, branchId, input);
  expect(result).toMatchObject({ branchId, kind: 'room_type' });
  expect(store.writes.find((write) => write.table === roomTypes)?.value).toMatchObject({
    branchId,
    bedMonthlyRentPaisa: 1800001n,
    roomMonthlyRentPaisa: 3200000n,
    depositPaisa: 0n,
  });
  expect(store.writes.find((write) => write.table === roomTypeFees)?.value).toEqual([
    { branchId, roomTypeId: result.id, code: 'mess', cadence: 'monthly', amountPaisa: 1001n },
  ]);
  expect(store.record).toHaveBeenCalledWith(
    store.transaction,
    expect.objectContaining({
      actorUserId: actor.userId,
      organizationId,
      branchId,
      actorRole: 'owner',
      targetId: result.id,
    }),
  );
});
it('BKG-004: configuration-only edits retain prices and fees without rewriting history', async () => {
  const store = fixture();
  store.enqueue(roomTypes, [
    {
      id: typeId,
      branchId,
      ...input,
      bedMonthlyRentPaisa: BigInt(input.bedMonthlyRentPaisa ?? 0),
      roomMonthlyRentPaisa: BigInt(input.roomMonthlyRentPaisa ?? 0),
      depositPaisa: 0n,
    },
  ]);
  store.enqueue(roomTypeFees, []);
  expect(
    await store.repository.roomType(
      store.transaction,
      actor,
      branchId,
      { ...input, fees: [] },
      typeId,
    ),
  ).toMatchObject({ id: typeId, kind: 'room_type' });
  expect(store.writes.some((write) => write.table === roomTypeFees)).toBe(false);
  expect(store.writes.find((write) => write.table === roomTypes)?.kind).toBe('update');
});
it('ACC-004: a missing/foreign room type cannot trigger a price update', async () => {
  const store = fixture();
  store.enqueue(roomTypes, []);
  await expect(
    store.repository.roomType(store.transaction, actor, branchId, input, typeId),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(store.writes).toHaveLength(0);
  expect(store.record).not.toHaveBeenCalled();
});
it('BKG-003: physical rooms retain their server-validated type and branch identity', async () => {
  const store = fixture();
  store.enqueue(roomTypes, [{ id: typeId }]);
  const result = await store.repository.room(store.transaction, actor, branchId, {
    roomTypeId: typeId,
    label: '101',
    status: 'active',
  });
  expect(result.kind).toBe('room');
  expect(store.writes.find((write) => write.table === rooms)?.value).toMatchObject({
    branchId,
    roomTypeId: typeId,
    label: '101',
    status: 'active',
  });
});
it('ACC-004: rooms cannot attach to missing or foreign types', async () => {
  const store = fixture();
  store.enqueue(roomTypes, []);
  await expect(
    store.repository.room(store.transaction, actor, branchId, {
      roomTypeId: typeId,
      label: '101',
      status: 'active',
    }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(store.writes).toHaveLength(0);
});
it.each([7, null])(
  'ACC-001: next bed ordinal is derived from durable history %s',
  async (ordinal) => {
    const store = fixture();
    store.enqueue(rooms, [{ id: roomId }]);
    store.enqueue(seats, [{ ordinal }]);
    await store.repository.seat(store.transaction, actor, branchId, roomId, {
      label: 'Next bed',
      status: 'active',
    });
    expect(store.writes.find((write) => write.table === seats)?.value).toMatchObject({
      ordinal: (ordinal ?? 0) + 1,
      roomId,
      branchId,
    });
  },
);
it('ACC-004: bed creation cannot attach to a missing or foreign room', async () => {
  const store = fixture();
  store.enqueue(rooms, []);
  await expect(
    store.repository.seat(store.transaction, actor, branchId, roomId, {
      label: 'A',
      status: 'active',
    }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(store.writes).toHaveLength(0);
});
