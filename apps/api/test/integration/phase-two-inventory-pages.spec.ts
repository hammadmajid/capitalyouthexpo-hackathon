import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { roomTypes, roomTypeFees, rooms, seats, managerAssignments } from '@hsm/db';
import {
  inventoryRoomTypePageSchema,
  inventoryRoomPageSchema,
  inventorySeatPageSchema,
} from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
let fixture: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  fixture = await phaseTwoFixture(new Date('2026-10-17T12:00:00Z'));
});
afterAll(async () => {
  await fixture?.close();
});
function headers(token = fixture.ownerToken) {
  return { authorization: 'Bearer ' + token };
}
function root(branchId: string) {
  return '/v1/branches/' + branchId + '/inventory/pages';
}
async function walk(
  url: string,
  read: (value: unknown) => { data: { id: string }[]; nextCursor: string | null },
) {
  const ids: string[] = [];
  let cursor: string | null = null;
  for (let count = 0; count < 10; count++) {
    const response = await fixture.application.inject({
      url: url + '?limit=20' + (cursor ? '&cursor=' + cursor : ''),
      headers: headers(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const page = read(response.json());
    expect(page.data.length).toBeLessThanOrEqual(20);
    ids.push(...page.data.map((row) => row.id));
    cursor = page.nextCursor;
    if (cursor === null) break;
    expect(cursor).toBe(page.data.at(-1)?.id);
  }
  expect(cursor).toBeNull();
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).toEqual([...ids].sort());
  return ids;
}
it('ROOM-002 / ACC-004: real 102-type replay reaches every type once and preserves exact prices and scoped fee batches', async () => {
  const inventory = await fixture.inventory(),
    ids = Array.from({ length: 101 }, () => randomUUID());
  await fixture.connection.db.insert(roomTypes).values(
    ids.map((id, index) => ({
      id,
      branchId: inventory.branchId,
      name: 'Type ' + index,
      capacity: 2,
      inventoryMode: 'both' as const,
      bedMonthlyRentPaisa: 1800001n,
      roomMonthlyRentPaisa: 3200000n,
      depositPaisa: 0n,
    })),
  );
  await fixture.connection.db.insert(roomTypeFees).values(
    ids.map((roomTypeId) => ({
      branchId: inventory.branchId,
      roomTypeId,
      code: 'mess',
      cadence: 'monthly',
      amountPaisa: 1001n,
    })),
  );
  const seen = await walk(root(inventory.branchId) + '/room-types', (value) => {
    const page = inventoryRoomTypePageSchema.parse(value);
    expect(page.branchId).toBe(inventory.branchId);
    expect(page.canConfigureManagers).toBe(true);
    for (const row of page.data.filter((row) => row.id !== inventory.roomTypeId)) {
      expect(row.bedMonthlyRentPaisa).toBe(1800001);
      expect(row.fees).toEqual([{ code: 'mess', cadence: 'monthly', amountPaisa: 1001 }]);
    }
    return page;
  });
  expect(seen).toEqual([...ids, inventory.roomTypeId].sort());
});
it('ROOM-002 / ACC-004: real 102-room and 103-bed continuation has no omissions or duplicate physical identities', async () => {
  const inventory = await fixture.inventory(),
    roomIds = Array.from({ length: 101 }, () => randomUUID()),
    bedIds = Array.from({ length: 101 }, () => randomUUID());
  await fixture.connection.db
    .update(roomTypes)
    .set({ capacity: 103 })
    .where(eq(roomTypes.id, inventory.roomTypeId));
  await fixture.connection.db.insert(rooms).values(
    roomIds.map((id, index) => ({
      id,
      branchId: inventory.branchId,
      roomTypeId: inventory.roomTypeId,
      label: 'Extra ' + index,
      status: 'active' as const,
    })),
  );
  await fixture.connection.db.insert(seats).values(
    bedIds.map((id, index) => ({
      id,
      branchId: inventory.branchId,
      roomId: inventory.roomId,
      ordinal: index + 3,
      label: 'Bed ' + (index + 3),
      status: 'active' as const,
    })),
  );
  expect(
    await walk(
      root(inventory.branchId) + '/room-types/' + inventory.roomTypeId + '/rooms',
      (value) => inventoryRoomPageSchema.parse(value),
    ),
  ).toEqual([...roomIds, inventory.roomId].sort());
  expect(
    await walk(root(inventory.branchId) + '/rooms/' + inventory.roomId + '/seats', (value) => {
      const page = inventorySeatPageSchema.parse(value);
      expect(page.roomId).toBe(inventory.roomId);
      expect(page.data.every((row) => row.ordinal > 0)).toBe(true);
      return page;
    }),
  ).toEqual([...bedIds, inventory.seatId, inventory.otherSeatId].sort());
});
it('ACC-004 / SEC-003: current read-only Manager can page its own branch; guessed branch and revoked assignment are denied', async () => {
  const inventory = await fixture.inventory(),
    foreign = await fixture.inventory(),
    assignmentId = randomUUID();
  await fixture.connection.db.insert(managerAssignments).values({
    id: assignmentId,
    userId: fixture.customerB,
    branchId: inventory.branchId,
    status: 'active',
    appointedByUserId: fixture.ownerId,
    activatedAt: fixture.now,
  });
  const response = await fixture.application.inject({
    url: root(inventory.branchId) + '/room-types',
    headers: headers(fixture.customerBToken),
  });
  expect(response.statusCode).toBe(200);
  const page = inventoryRoomTypePageSchema.parse(response.json());
  expect(page.permissions).toEqual([]);
  expect(page.canConfigureManagers).toBe(false);
  expect(
    (
      await fixture.application.inject({
        url: root(foreign.branchId) + '/room-types',
        headers: headers(fixture.customerBToken),
      })
    ).statusCode,
  ).toBe(403);
  await fixture.connection.db
    .update(managerAssignments)
    .set({ status: 'suspended' })
    .where(eq(managerAssignments.id, assignmentId));
  expect(
    (
      await fixture.application.inject({
        url: root(inventory.branchId) + '/room-types',
        headers: headers(fixture.customerBToken),
      })
    ).statusCode,
  ).toBe(403);
});
it('ACC-004: real foreign, missing and archived physical parents return 404 without exposing children', async () => {
  const inventory = await fixture.inventory(),
    foreign = await fixture.inventory();
  for (const suffix of [
    '/room-types/' + foreign.roomTypeId + '/rooms',
    '/rooms/' + foreign.roomId + '/seats',
    '/rooms/' + randomUUID() + '/seats',
  ])
    expect(
      (
        await fixture.application.inject({
          url: root(inventory.branchId) + suffix,
          headers: headers(),
        })
      ).statusCode,
    ).toBe(404);
  await fixture.connection.db
    .update(roomTypes)
    .set({ archivedAt: fixture.now })
    .where(eq(roomTypes.id, inventory.roomTypeId));
  for (const suffix of [
    '/room-types/' + inventory.roomTypeId + '/rooms',
    '/rooms/' + inventory.roomId + '/seats',
  ])
    expect(
      (
        await fixture.application.inject({
          url: root(inventory.branchId) + suffix,
          headers: headers(),
        })
      ).statusCode,
    ).toBe(404);
  const response = await fixture.application.inject({
    url: root(inventory.branchId) + '/room-types',
    headers: headers(),
  });
  expect(response.statusCode).toBe(200);
  expect(inventoryRoomTypePageSchema.parse(response.json()).data).toEqual([]);
});
