import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  bedPrices,
  hostelAuditLog,
  buildings,
  floors,
  rooms,
  seats,
  managerAssignments,
  managerInventoryGrants,
} from '@hsm/db';
import {
  bedRentPageSchema,
  bookingQuoteSnapshotSchema,
  branchInventorySchema,
  publicInventoryTypePageSchema,
} from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
let f: Awaited<ReturnType<typeof phaseTwoFixture>>;
type Item = Awaited<ReturnType<typeof f.inventory>>;
beforeAll(async () => {
  f = await phaseTwoFixture(new Date('2026-10-25T10:00:00Z'), undefined, {
    preScannedInventory: true,
  });
});
afterAll(async () => {
  await f?.close();
});
function publish(
  item: Item,
  amount: number,
  bedId = item.seatId,
  effectiveFrom = '2000-01-01',
  key = randomUUID(),
  token = f.ownerToken,
) {
  return f.application.inject({
    method: 'POST',
    url: `/v1/branches/${item.branchId}/inventory/beds/${bedId}/prices`,
    headers: { authorization: 'Bearer ' + token, 'Idempotency-Key': key },
    payload: { monthlyRentPaisa: amount, effectiveFrom },
  });
}
async function rent(item: Item, bedId = item.seatId) {
  const response = await f.application.inject({
    method: 'POST',
    url: `/v1/marketplace/${item.branchId}/quote`,
    payload: {
      target: { kind: 'bed', roomId: item.roomId, bedId },
      range: { moveInDate: '2026-11-01', moveOutDate: '2026-12-01' },
    },
  });
  expect(response.statusCode, response.body).toBe(200);
  return bookingQuoteSnapshotSchema.parse(response.json()).price.monthlyRentPaisa;
}
it('CHG-056 / BKG-004: two physical beds keep independent exact-paisa prices in quotes and projections', async () => {
  const item = await f.inventory();
  expect((await publish(item, 1000001)).statusCode).toBe(201);
  expect((await publish(item, 2000002, item.otherSeatId)).statusCode).toBe(201);
  expect(await rent(item)).toBe(1000001);
  expect(await rent(item, item.otherSeatId)).toBe(2000002);
  const inventory = await f.application.inject({
    url: `/v1/branches/${item.branchId}/inventory`,
    headers: { authorization: 'Bearer ' + f.ownerToken },
  });
  expect(inventory.statusCode, inventory.body).toBe(200);
  const beds = branchInventorySchema.parse(inventory.json()).rooms.flatMap((room) => room.seats);
  expect(beds.find((bed) => bed.id === item.seatId)?.monthlyRentPaisa).toBe(1000001);
  expect(beds.find((bed) => bed.id === item.otherSeatId)?.monthlyRentPaisa).toBe(2000002);
  const types = await f.application.inject({
    url: `/v1/marketplace/${item.branchId}/inventory/pages/room-types`,
  });
  expect(types.statusCode, types.body).toBe(200);
  expect(publicInventoryTypePageSchema.parse(types.json()).data[0]?.bedMonthlyRentPaisa).toBe(
    1000001,
  );
  const listing = await f.application.inject({
    url: `/v1/marketplace?ids=${item.branchId}&minimumRentPaisa=2000002&maximumRentPaisa=2000002`,
  });
  expect(listing.statusCode, listing.body).toBe(200);
  expect(listing.body).toContain(item.branchId);
});
it('CHG-056 / ACC-006: future prices stay inactive, zero is explicit, same-date corrections append and retries do not duplicate', async () => {
  const item = await f.inventory();
  expect((await publish(item, 3000000, item.seatId, '2099-01-01')).statusCode).toBe(201);
  expect(await rent(item)).toBe(1800000);
  const key = randomUUID(),
    initial = await publish(item, 0, item.seatId, '2000-01-01', key);
  expect(initial.statusCode, initial.body).toBe(201);
  expect((await publish(item, 0, item.seatId, '2000-01-01', key)).json()).toEqual(initial.json());
  expect(await rent(item)).toBe(0);
  expect((await publish(item, 12345)).statusCode).toBe(201);
  expect(await rent(item)).toBe(12345);
  const history = await f.application.inject({
    url: `/v1/branches/${item.branchId}/inventory/beds/${item.seatId}/prices?limit=1`,
    headers: { authorization: 'Bearer ' + f.ownerToken },
  });
  const page = bedRentPageSchema.parse(history.json());
  expect(page.data).toHaveLength(1);
  expect(page.nextCursor).not.toBeNull();
  expect(page.current?.monthlyRentPaisa).toBe(12345);
  expect(
    await f.connection.db.select().from(bedPrices).where(eq(bedPrices.bedId, item.seatId)),
  ).toHaveLength(3);
  const id = page.data[0]?.id;
  if (!id) throw new Error('Missing version');
  expect(
    await f.connection.db.select().from(hostelAuditLog).where(eq(hostelAuditLog.targetId, id)),
  ).toHaveLength(1);
  await expect(
    f.connection.db.update(bedPrices).set({ monthlyRentPaisa: 1n }).where(eq(bedPrices.id, id)),
  ).rejects.toThrow();
  await expect(f.connection.db.delete(bedPrices).where(eq(bedPrices.id, id))).rejects.toThrow();
});
it('CHG-056 / ACC-001: scope and pricing permission are checked; foreign beds and customer writes are denied', async () => {
  const item = await f.inventory(),
    other = await f.inventory();
  expect((await publish(item, 100, other.seatId)).statusCode).toBe(404);
  expect(
    (await publish(item, 100, item.seatId, '2000-01-01', randomUUID(), f.customerAToken))
      .statusCode,
  ).toBe(403);
  expect(await rent(item)).toBe(1800000);
});

it('ROOM-002 / BED-001: names edit without recreating inventory, stale edits fail and archive preserves history', async () => {
  const item = await f.inventory(),
    buildingId = randomUUID(),
    floorId = randomUUID();
  await f.connection.db
    .insert(buildings)
    .values({ id: buildingId, branchId: item.branchId, name: 'Block A' });
  await f.connection.db
    .insert(floors)
    .values({ id: floorId, branchId: item.branchId, buildingId, label: 'Ground', levelNumber: 0 });
  const targets = [
    ['building', buildingId, 'Block A'],
    ['floor', floorId, 'Ground'],
    ['room', item.roomId, '101'],
    ['seat', item.seatId, 'A'],
  ] as const;
  for (const [kind, targetId, expectedName] of targets) {
    const command = {
      method: 'POST' as const,
      url: `/v1/branches/${item.branchId}/inventory/metadata/${kind}/${targetId}/rename`,
      headers: { authorization: 'Bearer ' + f.ownerToken, 'Idempotency-Key': randomUUID() },
      payload: { name: expectedName + ' revised', expectedName },
    };
    const result = await f.application.inject(command);
    expect(result.statusCode, result.body).toBe(200);
    expect(result.json()).toMatchObject({ id: targetId, kind, name: expectedName + ' revised' });
    expect((await f.application.inject(command)).json()).toEqual(result.json());
    expect(
      (
        await f.application.inject({
          ...command,
          headers: { ...command.headers, 'Idempotency-Key': randomUUID() },
        })
      ).statusCode,
    ).toBe(412);
  }
  const [building] = await f.connection.db
    .select()
    .from(buildings)
    .where(eq(buildings.id, buildingId));
  const [floor] = await f.connection.db.select().from(floors).where(eq(floors.id, floorId));
  expect(building?.version).toBe(2);
  expect(floor?.version).toBe(2);
  expect(
    (await f.connection.db.select().from(rooms).where(eq(rooms.id, item.roomId)))[0]?.roomTypeId,
  ).toBe(item.roomTypeId);
  expect(
    (await f.connection.db.select().from(seats).where(eq(seats.id, item.seatId)))[0]?.ordinal,
  ).toBe(1);
  const remove = await f.application.inject({
    method: 'POST',
    url: `/v1/branches/${item.branchId}/inventory/seats/${item.seatId}/archive`,
    headers: { authorization: 'Bearer ' + f.ownerToken, 'Idempotency-Key': randomUUID() },
    payload: { reason: 'Setup removal' },
  });
  expect(remove.statusCode, remove.body).toBe(200);
  expect(
    (await f.connection.db.select().from(seats).where(eq(seats.id, item.seatId)))[0]?.archivedAt,
  ).not.toBeNull();
});
it('ACC-001 / ACC-006: pricing grant revocation denies a previously successful replay', async () => {
  const item = await f.inventory(),
    assignmentId = randomUUID(),
    key = randomUUID();
  await f.connection.db.insert(managerAssignments).values({
    id: assignmentId,
    userId: f.customerB,
    branchId: item.branchId,
    status: 'active',
    appointedByUserId: f.ownerId,
    activatedAt: f.now,
  });
  await f.connection.db.insert(managerInventoryGrants).values(
    (['inventory_edit', 'pricing_edit'] as const).map((permission) => ({
      assignmentId,
      permission,
      grantedAt: f.now,
    })),
  );
  const first = await publish(item, 900001, item.seatId, '2000-01-01', key, f.customerBToken);
  expect(first.statusCode, first.body).toBe(201);
  await f.connection.db
    .delete(managerInventoryGrants)
    .where(eq(managerInventoryGrants.assignmentId, assignmentId));
  expect(
    (await publish(item, 900001, item.seatId, '2000-01-01', key, f.customerBToken)).statusCode,
  ).toBe(403);
});

it('CHG-056 / BED-001: creating a priced bed is atomic, exact and idempotent', async () => {
  const item = await f.inventory();
  const headers = { authorization: 'Bearer ' + f.ownerToken, 'Idempotency-Key': randomUUID() };
  const room = await f.application.inject({
    method: 'POST',
    url: `/v1/branches/${item.branchId}/inventory/rooms`,
    headers,
    payload: { roomTypeId: item.roomTypeId, label: '102', status: 'active' },
  });
  expect(room.statusCode, room.body).toBe(200);
  const roomId = String(room.json().id);
  const command = {
    method: 'POST' as const,
    url: `/v1/branches/${item.branchId}/inventory/rooms/${roomId}/seats`,
    headers: { ...headers, 'Idempotency-Key': randomUUID() },
    payload: { label: '102-A', status: 'active', monthlyRentPaisa: 1234567 },
  };
  const bed = await f.application.inject(command);
  expect(bed.statusCode, bed.body).toBe(200);
  expect((await f.application.inject(command)).json()).toEqual(bed.json());
  const bedId = String(bed.json().id);
  const versions = await f.connection.db.select().from(bedPrices).where(eq(bedPrices.bedId, bedId));
  expect(versions).toHaveLength(1);
  expect(versions[0]?.monthlyRentPaisa).toBe(1234567n);
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
  const denied = await f.application.inject({
    ...command,
    headers: { authorization: 'Bearer ' + f.customerAToken, 'Idempotency-Key': randomUUID() },
    payload: { ...command.payload, label: '102-B' },
  });
  expect(denied.statusCode, denied.body).toBe(403);
  expect(await f.connection.db.select().from(seats).where(eq(seats.roomId, roomId))).toHaveLength(
    1,
  );
});
