import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import {
  hostelAuditLog,
  managerAssignments,
  managerInventoryGrants,
  buildings,
  floors,
  rooms,
  seats,
  roomTypes,
  inventoryClaims,
} from '@hsm/db';
import { roomDuplicationResultSchema } from '@hsm/contracts';
import { AuditWriter } from '../../src/audit/writer.js';
import { phaseTwoFixture } from './phase-two-fixture.js';
let f: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  f = await phaseTwoFixture(new Date('2026-10-24T10:00:00Z'));
});
afterAll(async () => {
  await f?.close();
});
function request(
  item: { branchId: string; roomId: string },
  payload: Record<string, unknown>,
  key = randomUUID(),
  token = f.ownerToken,
) {
  return {
    method: 'POST' as const,
    url: `/v1/branches/${item.branchId}/inventory/rooms/${item.roomId}/duplicate`,
    payload,
    headers: { authorization: 'Bearer ' + token, 'Idempotency-Key': key },
  };
}
it('PROP-001 / ROOM-002: real HTTP range copies share configuration but have fresh inactive identities and one audited replay', async () => {
  const item = await f.inventory(),
    command = request(item, { from: 201, to: 202 });
  // CHG-048: the source room sits on a floor; its copies must land on the same floor.
  const buildingId = randomUUID(),
    floorId = randomUUID();
  await f.connection.db
    .insert(buildings)
    .values({ id: buildingId, branchId: item.branchId, name: 'Block B' });
  await f.connection.db
    .insert(floors)
    .values({ id: floorId, branchId: item.branchId, buildingId, label: 'Floor 2', levelNumber: 2 });
  await f.connection.db.update(rooms).set({ floorId }).where(eq(rooms.id, item.roomId));
  const response = await f.application.inject(command);
  expect(response.statusCode).toBe(201);
  const result = roomDuplicationResultSchema.parse(response.json());
  expect(result).toMatchObject({ branchId: item.branchId, sourceRoomId: item.roomId });
  expect(result.roomIds).toHaveLength(2);
  const copied = await f.connection.db
    .select()
    .from(rooms)
    .where(inArray(rooms.id, result.roomIds));
  expect(copied.map((room) => room.label).sort()).toEqual(['201', '202']);
  for (const room of copied) {
    expect(room).toMatchObject({
      branchId: item.branchId,
      roomTypeId: item.roomTypeId,
      floorId,
      status: 'inactive',
    });
    const beds = await f.connection.db
      .select()
      .from(seats)
      .where(eq(seats.roomId, room.id))
      .orderBy(seats.ordinal);
    expect(beds.map((bed) => [bed.ordinal, bed.label, bed.status])).toEqual([
      [1, 'B1', 'inactive'],
      [2, 'B2', 'inactive'],
    ]);
    expect(beds.every((bed) => bed.id !== item.seatId && bed.id !== item.otherSeatId)).toBe(true);
  }
  expect(
    await f.connection.db
      .select()
      .from(inventoryClaims)
      .where(inArray(inventoryClaims.roomId, result.roomIds)),
  ).toHaveLength(0);
  const replay = await f.application.inject(command);
  expect(replay.statusCode).toBe(201);
  expect(replay.headers['idempotency-replayed']).toBe('true');
  expect(replay.json()).toEqual(result);
  expect(
    await f.connection.db
      .select()
      .from(hostelAuditLog)
      .where(
        and(
          eq(hostelAuditLog.targetId, item.roomId),
          eq(hostelAuditLog.action, 'inventory.room.duplicate'),
        ),
      ),
  ).toHaveLength(1);
});
it('PROP-001: collisions reject the entire batch, including concurrent overlapping ranges', async () => {
  const item = await f.inventory();
  expect(
    (await f.application.inject(request(item, { roomNumbers: ['201', '101'] }))).statusCode,
  ).toBe(409);
  expect(
    await f.connection.db.select().from(rooms).where(eq(rooms.branchId, item.branchId)),
  ).toHaveLength(1);
  const results = await Promise.all([
    f.application.inject(request(item, { from: 201, to: 202 })),
    f.application.inject(request(item, { from: 202, to: 203 })),
  ]);
  expect(results.map((result) => result.statusCode).sort()).toEqual([201, 409]);
  expect(
    await f.connection.db.select().from(rooms).where(eq(rooms.branchId, item.branchId)),
  ).toHaveLength(3);
});
it('ACC-004 / MGR-004: live inventory grant and exact source scope apply to new commands and replays', async () => {
  const item = await f.inventory(),
    foreign = await f.inventory(),
    assignmentId = randomUUID();
  await f.connection.db.insert(managerAssignments).values({
    id: assignmentId,
    userId: f.customerB,
    branchId: item.branchId,
    status: 'active',
    appointedByUserId: f.ownerId,
    activatedAt: f.now,
  });
  const command = request(item, { roomNumbers: ['301'] }, randomUUID(), f.customerBToken);
  expect((await f.application.inject(command)).statusCode).toBe(403);
  await f.connection.db
    .insert(managerInventoryGrants)
    .values({ assignmentId, permission: 'inventory_edit', grantedAt: f.now });
  expect((await f.application.inject(command)).statusCode).toBe(201);
  expect(
    (
      await f.application.inject(
        request({ ...item, roomId: foreign.roomId }, { roomNumbers: ['302'] }),
      )
    ).statusCode,
  ).toBe(404);
  expect(
    (
      await f.application.inject(
        request(foreign, { roomNumbers: ['302'] }, randomUUID(), f.customerBToken),
      )
    ).statusCode,
  ).toBe(403);
  await f.connection.db
    .delete(managerInventoryGrants)
    .where(eq(managerInventoryGrants.assignmentId, assignmentId));
  expect((await f.application.inject(command)).statusCode).toBe(403);
});
it('PROP-001 / SEC-003: failed audit rolls back every copy and its idempotency result', async () => {
  const item = await f.inventory(),
    command = request(item, { roomNumbers: ['401', '402'] });
  const audit = vi
    .spyOn(AuditWriter.prototype, 'hostel')
    .mockRejectedValueOnce(new Error('Fixture audit failure'));
  try {
    expect((await f.application.inject(command)).statusCode).toBe(500);
  } finally {
    audit.mockRestore();
  }
  expect(
    await f.connection.db.select().from(rooms).where(eq(rooms.branchId, item.branchId)),
  ).toHaveLength(1);
  expect((await f.application.inject(command)).statusCode).toBe(201);
});
it('PROP-001: strict input, resource bounds and archived source never partially mutate', async () => {
  const item = await f.inventory();
  expect((await f.application.inject(request(item, { from: 0, to: 100 }))).statusCode).toBe(400);
  await f.connection.db
    .update(roomTypes)
    .set({ capacity: 5001 })
    .where(eq(roomTypes.id, item.roomTypeId));
  expect((await f.application.inject(request(item, { roomNumbers: ['501'] }))).statusCode).toBe(
    422,
  );
  await f.connection.db.update(rooms).set({ archivedAt: f.now }).where(eq(rooms.id, item.roomId));
  expect((await f.application.inject(request(item, { roomNumbers: ['501'] }))).statusCode).toBe(
    404,
  );
  expect(
    await f.connection.db.select().from(rooms).where(eq(rooms.branchId, item.branchId)),
  ).toHaveLength(1);
});
