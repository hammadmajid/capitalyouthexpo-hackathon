import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { roomTypes, roomTypeAmenities, amenities } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import { PgDialect } from 'drizzle-orm/pg-core';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { AuditWriter } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from './scope.js';
import { inventoryPermissions } from './permissions.js';
import { projectRoomAmenities } from './room-amenities-state.js';
import { RoomAmenitiesRepository } from './room-amenities.repository.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('./scope.js', () => ({ lockInventoryScope: vi.fn() }));
vi.mock('./permissions.js', () => ({ inventoryPermissions: vi.fn() }));
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  branchId = randomUUID(),
  roomTypeId = randomUUID(),
  organizationId = randomUUID(),
  now = new Date('2026-10-17T10:00:00Z');
const wifi = { code: 'wifi', name: 'Wi-Fi', isActive: true };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(lockActor).mockResolvedValue(undefined);
  vi.mocked(lockInventoryScope).mockResolvedValue({
    organizationId,
    brandId: randomUUID(),
    ownerId: actor.userId,
    actorRole: 'owner',
  });
  vi.mocked(inventoryPermissions).mockResolvedValue({
    permissions: ['listing_edit'],
    canConfigureManagers: true,
  });
});
function fixture() {
  const store = queryFixture(),
    audit = new AuditWriter();
  vi.spyOn(audit, 'hostel').mockResolvedValue(undefined);
  store.enqueue(roomTypes, [{ id: roomTypeId }]);
  store.enqueue(roomTypeAmenities, [wifi]);
  return {
    store,
    audit,
    repository: new RoomAmenitiesRepository(store.database, audit, () => now),
    version: projectRoomAmenities(branchId, roomTypeId, [wifi], true).version,
  };
}
it.each([true, false])(
  'ACC-004: private room amenity read projects actual edit permission %s',
  async (canEdit) => {
    const value = fixture();
    vi.mocked(inventoryPermissions).mockResolvedValue({
      permissions: canEdit ? ['listing_edit'] : [],
      canConfigureManagers: false,
    });
    expect(await value.repository.read(actor, branchId, roomTypeId)).toMatchObject({
      branchId,
      roomTypeId,
      amenities: [wifi],
      canEdit,
    });
    expect(lockInventoryScope).toHaveBeenCalledWith(
      value.store.transaction,
      actor,
      branchId,
      undefined,
    );
    expect(lockActor).toHaveBeenCalledTimes(3);
    expect(value.audit.hostel).not.toHaveBeenCalled();
  },
);
it('ACC-004: denied scope precedes all room reads and writes', async () => {
  const value = fixture();
  vi.mocked(lockInventoryScope).mockRejectedValue(new DomainError('FORBIDDEN', 403, 'Denied'));
  await expect(value.repository.read(actor, branchId, roomTypeId)).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  expect(value.store.operations).toEqual([]);
  expect(value.store.writes).toEqual([]);
  expect(value.store.operations.filter((operation) => operation.kind === 'delete')).toEqual([]);
});
it('ROOM-002: a missing active child cannot receive amenity updates', async () => {
  const store = queryFixture(),
    repository = new RoomAmenitiesRepository(store.database);
  store.enqueue(roomTypes, []);
  await expect(
    repository.save(store.transaction, actor, branchId, roomTypeId, 'a'.repeat(64), {
      amenityCodes: [],
    }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(store.writes).toEqual([]);
  expect(store.operations.filter((operation) => operation.kind === 'delete')).toEqual([]);
});
it('ROOM-002: stale versions fail before associations or audit are modified', async () => {
  const value = fixture();
  await expect(
    value.repository.save(value.store.transaction, actor, branchId, roomTypeId, '0'.repeat(64), {
      amenityCodes: [],
    }),
  ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED', status: 412 });
  expect(value.store.writes).toEqual([]);
  expect(value.store.operations.filter((operation) => operation.kind === 'delete')).toEqual([]);
  expect(value.audit.hostel).not.toHaveBeenCalled();
});
it.each([true, false])(
  'ROOM-002 / AUD-001: save explicit room amenities, retain pricing and audit one transaction (selection %s)',
  async (selected) => {
    const value = fixture();
    if (selected) value.store.enqueue(amenities, [wifi]);
    value.store.enqueue(roomTypeAmenities, [], ...(selected ? [[]] : []), selected ? [wifi] : []);
    const input = { amenityCodes: selected ? ['wifi'] : [] };
    const after = await value.repository.save(
      value.store.transaction,
      actor,
      branchId,
      roomTypeId,
      value.version,
      input,
    );
    expect(after.amenities).toEqual(selected ? [wifi] : []);
    expect(value.store.writes.every((write) => write.table === roomTypeAmenities)).toBe(true);
    expect(value.store.writes.map((write) => write.kind)).toEqual(selected ? ['insert'] : []);
    expect(value.store.operations.filter((operation) => operation.kind === 'delete')).toEqual([
      { table: roomTypeAmenities, kind: 'delete', args: [] },
    ]);
    const predicates = value.store.predicates.filter((entry) => entry.table === roomTypeAmenities);
    expect(predicates).toHaveLength(3);
    for (const predicate of predicates) {
      expect(new PgDialect().sqlToQuery(predicate.value).params).toEqual(
        expect.arrayContaining([branchId, roomTypeId]),
      );
    }
    expect(value.audit.hostel).toHaveBeenCalledWith(
      value.store.transaction,
      expect.objectContaining({
        branchId,
        organizationId,
        targetId: roomTypeId,
        action: 'room_type.amenities.changed',
        before: expect.objectContaining({ amenities: [wifi] }),
        after,
      }),
    );
    expect(lockActor).toHaveBeenCalledTimes(4);
  },
);
it('AUD-001: audit failure propagates so the enclosing real transaction can roll back', async () => {
  const value = fixture();
  value.store.enqueue(roomTypeAmenities, [], []);
  vi.mocked(value.audit.hostel).mockRejectedValue(new Error('Audit unavailable'));
  await expect(
    value.repository.save(value.store.transaction, actor, branchId, roomTypeId, value.version, {
      amenityCodes: [],
    }),
  ).rejects.toThrow('Audit unavailable');
});
