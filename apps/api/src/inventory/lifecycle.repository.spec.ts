import { InventoryRepository } from './repository.js';
import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { rooms, roomTypes, seats, inventoryClaims, expireRoomReservations } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { AuditWriter } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from './scope.js';
import { InventoryLifecycleRepository } from './lifecycle.repository.js';
import type { LifecycleTarget } from './lifecycle-target.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('./scope.js', () => ({ lockInventoryScope: vi.fn() }));
vi.mock('@hsm/db', async (original) => ({
  ...(await original<typeof import('@hsm/db')>()),
  expireRoomReservations: vi.fn(),
}));
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  branchId = randomUUID();
const typeId = randomUUID(),
  roomId = randomUUID(),
  seatId = randomUUID();
const now = new Date('2026-10-15T10:00:00Z');
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(lockInventoryScope).mockResolvedValue({
    organizationId: randomUUID(),
    brandId: randomUUID(),
    ownerId: actor.userId,
    actorRole: 'owner',
  });
});
function fixture(kind: LifecycleTarget['kind'], missing?: 'target' | 'parent' | 'room') {
  const store = queryFixture(),
    audit = new AuditWriter();
  const record = vi.spyOn(audit, 'hostel').mockResolvedValue(undefined);
  store.enqueue(
    roomTypes,
    missing === 'parent' || (kind === 'room_type' && missing === 'target') ? [] : [{ id: typeId }],
  );
  store.enqueue(
    rooms,
    (kind === 'room' && missing === 'target') || missing === 'room'
      ? []
      : [{ id: roomId, roomTypeId: typeId, status: 'active' }],
  );
  store.enqueue(
    seats,
    kind === 'seat' && missing === 'target' ? [] : [{ id: seatId, roomId, status: 'active' }],
  );
  const target = { kind, id: kind === 'room_type' ? typeId : kind === 'room' ? roomId : seatId };
  return {
    ...store,
    target,
    record,
    repository: new InventoryRepository(store.database, audit, () => new Date(now.getTime())),
  };
}
it.each(['room', 'seat'] as const)(
  'PROP-002 / ACC-004: %s state changes lock scope and children, then audit the transaction',
  async (kind) => {
    const value = fixture(kind);
    const result = await value.repository.state(
      value.transaction,
      actor,
      branchId,
      { kind, id: value.target.id },
      'maintenance',
      'Scheduled work',
    );
    expect(result).toEqual({ id: value.target.id, branchId, kind });
    expect(expireRoomReservations).toHaveBeenCalledWith(value.transaction, roomId, now);
    expect(lockActor).toHaveBeenCalledWith(value.transaction, actor, expect.any(Function));
    expect(value.writes).toHaveLength(1);
    expect(value.writes[0]?.value).toEqual({ status: 'maintenance', updatedAt: now });
    expect(value.record).toHaveBeenCalledWith(
      value.transaction,
      expect.objectContaining({
        branchId,
        actorUserId: actor.userId,
        action: 'inventory.' + kind + '.state_changed',
        before: { status: 'active' },
        after: { status: 'maintenance', reason: 'Scheduled work' },
      }),
    );
  },
);
it.each(['room', 'seat', 'room_type'] as const)(
  'ACC-001: live reservations prevent %s archival without writes or audit',
  async (kind) => {
    const value = fixture(kind);
    value.enqueue(inventoryClaims, [{ id: randomUUID() }]);
    await expect(
      value.repository.archive(
        value.transaction,
        actor,
        branchId,
        value.target,
        'Retire inventory',
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(value.writes).toHaveLength(0);
    expect(value.record).not.toHaveBeenCalled();
  },
);
it.each(['room', 'seat'] as const)(
  'ACC-001: live reservations prevent taking a %s offline',
  async (kind) => {
    const value = fixture(kind);
    value.enqueue(inventoryClaims, [{ id: randomUUID() }]);
    await expect(
      value.repository.state(
        value.transaction,
        actor,
        branchId,
        { kind, id: value.target.id },
        'inactive',
        'Offline',
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(value.writes).toHaveLength(0);
  },
);
it.each(['room', 'seat', 'room_type'] as const)(
  'PROP-002: %s archival preserves records and archives the relevant hierarchy',
  async (kind) => {
    const value = fixture(kind);
    await expect(
      value.repository.archive(value.transaction, actor, branchId, value.target, 'Retired'),
    ).resolves.toEqual({ id: value.target.id, branchId, kind });
    expect(value.writes.map((write) => write.table)).toEqual(
      kind === 'seat' ? [seats] : kind === 'room' ? [seats, rooms] : [seats, rooms, roomTypes],
    );
    for (const write of value.writes)
      expect(write.value).toEqual({ archivedAt: now, updatedAt: now });
    expect(value.operations.some((operation) => operation.kind === 'delete')).toBe(false);
    expect(value.record).toHaveBeenCalledTimes(1);
  },
);
it.each(['room', 'seat', 'room_type'] as const)(
  'ACC-004: absent or foreign %s cannot be mutated',
  async (kind) => {
    const value = fixture(kind, 'target');
    await expect(
      value.repository.archive(value.transaction, actor, branchId, value.target, 'Retired'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(value.writes).toHaveLength(0);
  },
);
it.each(['room', 'seat'] as const)(
  'PROP-002: an archived parent type cannot be bypassed by its %s',
  async (kind) => {
    const value = fixture(kind, 'parent');
    await expect(
      value.repository.state(
        value.transaction,
        actor,
        branchId,
        { kind, id: value.target.id },
        'active',
        'Activate',
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(value.writes).toHaveLength(0);
  },
);
it('SEC-003: fresh session rejection after child locks prevents mutation', async () => {
  const value = fixture('room');
  vi.mocked(lockActor).mockRejectedValueOnce(new DomainError('UNAUTHENTICATED', 401, 'Expired'));
  await expect(
    value.repository.state(
      value.transaction,
      actor,
      branchId,
      { kind: 'room', id: roomId },
      'active',
      'Activate',
    ),
  ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  expect(value.writes).toHaveLength(0);
  expect(value.record).not.toHaveBeenCalled();
});
it('ACC-004: missing branch permission fails before child lookup', async () => {
  const value = fixture('room');
  vi.mocked(lockInventoryScope).mockRejectedValueOnce(
    new DomainError('FORBIDDEN', 403, 'Grant revoked'),
  );
  await expect(
    value.repository.archive(value.transaction, actor, branchId, value.target, 'Retired'),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(value.predicates).toHaveLength(0);
  expect(value.writes).toHaveLength(0);
});

it('ACC-004: a bed cannot bypass an unavailable parent room', async () => {
  const value = fixture('seat', 'room');
  await expect(
    value.repository.archive(value.transaction, actor, branchId, value.target, 'Retired'),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(value.writes).toHaveLength(0);
});
it('PROP-002: an empty room type archives without inventing child inventory', async () => {
  const store = queryFixture(),
    audit = new AuditWriter();
  const record = vi.spyOn(audit, 'hostel').mockResolvedValue(undefined);
  store.enqueue(roomTypes, [{ id: typeId }]);
  const repository = new InventoryLifecycleRepository(audit, () => now);
  await repository.archive(
    store.transaction,
    actor,
    branchId,
    { kind: 'room_type', id: typeId },
    'Retired',
  );
  expect(store.writes.map((write) => write.table)).toEqual([roomTypes]);
  expect(expireRoomReservations).not.toHaveBeenCalled();
  expect(record).toHaveBeenCalledTimes(1);
});
