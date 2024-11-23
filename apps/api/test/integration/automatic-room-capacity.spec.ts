import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  buildings,
  floors,
  roomTypes,
  seats,
  bedPrices,
  managerAssignments,
  managerInventoryGrants,
} from '@hsm/db';
import { branchInventorySchema } from '@hsm/contracts';
import { publishInventoryPhotos } from './inventory-photos.fixture.js';
import { phaseTwoFixture } from './phase-two-fixture.js';

let f: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  f = await phaseTwoFixture(new Date('2026-10-25T10:00:00Z'), undefined, {
    preScannedInventory: true,
  });
});
afterAll(async () => {
  await f?.close();
});
async function context() {
  const item = await f.inventory(),
    buildingId = randomUUID(),
    floorId = randomUUID();
  await f.connection.db
    .insert(buildings)
    .values({ id: buildingId, branchId: item.branchId, name: 'A' });
  await f.connection.db
    .insert(floors)
    .values({ id: floorId, branchId: item.branchId, buildingId, label: 'Ground', levelNumber: 0 });
  return { ...item, floorId };
}
function post(
  branch: string,
  path: string,
  payload: object,
  token = f.ownerToken,
  key = randomUUID(),
) {
  return f.application.inject({
    method: 'POST',
    url: `/v1/branches/${branch}/inventory/${path}`,
    headers: { authorization: 'Bearer ' + token, 'Idempotency-Key': key },
    payload,
  });
}
async function read(branch: string) {
  const response = await f.application.inject({
    url: `/v1/branches/${branch}/inventory`,
    headers: { authorization: 'Bearer ' + f.ownerToken },
  });
  expect(response.statusCode, response.body).toBe(200);
  return branchInventorySchema.parse(response.json());
}
it('CHG-057 / ROOM-002: empty room is unpriced; each added/archived physical bed changes room size, not security', async () => {
  const item = await context(),
    payload = { label: 'New room', floorId: item.floorId },
    key = randomUUID();
  const created = await post(item.branchId, 'setup-rooms', payload, f.ownerToken, key);
  expect(created.statusCode, created.body).toBe(201);
  expect((await post(item.branchId, 'setup-rooms', payload, f.ownerToken, key)).json()).toEqual(
    created.json(),
  );
  const roomId = String(created.json().id);
  let inventory = await read(item.branchId);
  const room = inventory.rooms.find((row) => row.id === roomId);
  expect(room).toMatchObject({ capacity: 0, seats: [] });
  expect(inventory.roomTypes.find((type) => type.id === room?.roomTypeId)).toMatchObject({
    setupManaged: true,
    capacity: 0,
    bedMonthlyRentPaisa: null,
    depositPaisa: 0,
  });
  const missing = await post(item.branchId, `rooms/${roomId}/seats`, {
    label: 'Unpriced',
    status: 'active',
  });
  expect(missing.statusCode, missing.body).toBe(422);
  const ids: string[] = [];
  for (let index = 1; index <= 4; index++) {
    const bed = await post(item.branchId, `rooms/${roomId}/seats`, {
      label: 'Bed ' + index,
      status: index === 4 ? 'maintenance' : 'active',
      monthlyRentPaisa: index * 100001,
    });
    expect(bed.statusCode, bed.body).toBe(200);
    ids.push(String(bed.json().id));
    inventory = await read(item.branchId);
    expect(inventory.rooms.find((row) => row.id === roomId)?.capacity).toBe(index);
  }
  expect(inventory.roomTypes.find((type) => type.id === room?.roomTypeId)).toMatchObject({
    name: '4-bed room',
    capacity: 4,
    depositPaisa: 0,
  });
  expect(
    await f.connection.db
      .select()
      .from(bedPrices)
      .where(eq(bedPrices.bedId, ids[0] ?? '')),
  ).toMatchObject([{ monthlyRentPaisa: 100001n }]);
  await publishInventoryPhotos(f.connection.db, {
    bucket: f.storage.bucket,
    ownerId: f.ownerId,
    branchId: item.branchId,
    roomId,
    seatIds: ids,
    now: f.now,
  });
  const detail = await f.application.inject({
    url: `/v1/marketplace/${item.branchId}/inventory/pages/room-types`,
  });
  expect(detail.statusCode, detail.body).toBe(200);
  expect(
    detail.json().data.find((type: { id: string }) => type.id === room?.roomTypeId),
  ).toMatchObject({ capacity: 4, bedMonthlyRentPaisa: 100001 });
  const quote = await f.application.inject({
    method: 'POST',
    url: `/v1/marketplace/${item.branchId}/quote`,
    payload: {
      target: { kind: 'bed', roomId, bedId: ids[0] },
      range: { moveInDate: '2026-11-01', moveOutDate: '2026-12-01' },
    },
  });
  expect(quote.statusCode, quote.body).toBe(200);
  expect(quote.json().price.monthlyRentPaisa).toBe(100001);
  const archived = await post(item.branchId, `seats/${ids[0]}/archive`, {
    reason: 'Remove installed bed',
  });
  expect(archived.statusCode, archived.body).toBe(200);
  expect((await read(item.branchId)).rooms.find((row) => row.id === roomId)?.capacity).toBe(3);
  expect(
    (
      await f.connection.db
        .select()
        .from(seats)
        .where(eq(seats.id, ids[0] ?? ''))
    )[0]?.archivedAt,
  ).not.toBeNull();
});
it('CHG-057 / ACC-001: room identity endpoint rejects pricing/count fields and foreign floors; inventory grant cannot set rent', async () => {
  const item = await context(),
    other = await context(),
    input = { label: 'Room', floorId: item.floorId };
  expect((await post(item.branchId, 'setup-rooms', { ...input, capacity: 4 })).statusCode).toBe(
    400,
  );
  expect(
    (await post(item.branchId, 'setup-rooms', { ...input, depositPaisa: 100 })).statusCode,
  ).toBe(400);
  expect(
    (await post(item.branchId, 'setup-rooms', { ...input, floorId: other.floorId })).statusCode,
  ).toBe(404);
  expect((await post(item.branchId, 'setup-rooms', input, f.customerAToken)).statusCode).toBe(403);
  const assignmentId = randomUUID();
  await f.connection.db.insert(managerAssignments).values({
    id: assignmentId,
    userId: f.customerA,
    branchId: item.branchId,
    status: 'active',
    appointedByUserId: f.ownerId,
    activatedAt: f.now,
  });
  await f.connection.db
    .insert(managerInventoryGrants)
    .values({ assignmentId, permission: 'inventory_edit', grantedAt: f.now });
  const created = await post(item.branchId, 'setup-rooms', input, f.customerAToken);
  expect(created.statusCode, created.body).toBe(201);
  expect(
    (
      await post(
        item.branchId,
        `rooms/${created.json().id}/seats`,
        { label: 'A', status: 'active', monthlyRentPaisa: 100 },
        f.customerAToken,
      )
    ).statusCode,
  ).toBe(403);
  const type = (
    await f.connection.db.select().from(roomTypes).where(eq(roomTypes.branchId, item.branchId))
  ).find((row) => row.setupManaged);
  expect(type?.bedMonthlyRentPaisa).toBeNull();
});

it('CHG-057 / BKG-004: seater and price must match the same physical room, even in a legacy shared group', async () => {
  const item = await f.inventory();
  const created = await post(item.branchId, 'rooms', {
    roomTypeId: item.roomTypeId,
    label: 'Small',
    status: 'active',
  });
  expect(created.statusCode, created.body).toBe(200);
  const roomId = String(created.json().id);
  const bed = await post(item.branchId, `rooms/${roomId}/seats`, {
    label: 'A',
    status: 'active',
    monthlyRentPaisa: 100,
  });
  expect(bed.statusCode, bed.body).toBe(200);
  await publishInventoryPhotos(f.connection.db, {
    bucket: f.storage.bucket,
    ownerId: f.ownerId,
    branchId: item.branchId,
    roomId,
    seatIds: [String(bed.json().id)],
    now: f.now,
  });
  for (const label of ['C', 'D'])
    expect(
      (
        await post(item.branchId, `rooms/${item.roomId}/seats`, {
          label,
          status: 'maintenance',
          monthlyRentPaisa: 1800000,
        })
      ).statusCode,
    ).toBe(200);
  const inventory = await read(item.branchId);
  expect(inventory.rooms.find((row) => row.id === roomId)?.capacity).toBe(1);
  expect(inventory.rooms.find((row) => row.id === item.roomId)?.capacity).toBe(4);
  for (const [capacity, count] of [
    [4, 0],
    [1, 1],
  ] as const) {
    const response = await f.application.inject({
      url: `/v1/marketplace?ids=${item.branchId}&capacity=${capacity}&maximumRentPaisa=100`,
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toHaveLength(count);
  }
});
