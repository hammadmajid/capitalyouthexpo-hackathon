import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { branches, roomTypes, rooms, seats } from '@hsm/db';
import {
  publicInventoryTypePageSchema,
  publicInventoryRoomPageSchema,
  publicInventoryBedPageSchema,
  listingOverviewSchema,
} from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
import { publishInventoryPhotos } from './inventory-photos.fixture.js';
let fixture: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  fixture = await phaseTwoFixture(new Date('2026-10-17T12:00:00Z'), undefined, {
    preScannedInventory: true,
  });
});
afterAll(async () => {
  await fixture?.close();
});
const root = (branchId: string) => '/v1/marketplace/' + branchId + '/inventory/pages';
async function walk(
  url: string,
  read: (value: unknown) => { data: { id: string }[]; nextCursor: string | null },
) {
  const ids: string[] = [];
  let cursor: string | null = null;
  for (let count = 0; count < 10; count++) {
    const response = await fixture.application.inject({
      url: url + '?limit=20' + (cursor ? '&cursor=' + cursor : ''),
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
it('ACC-002 / P2-S1: real >100 type/room/bed traversal has no duplicates, skips or business cap', async () => {
  const inventory = await fixture.inventory(),
    typeIds = Array.from({ length: 101 }, () => randomUUID()),
    roomIds = Array.from({ length: 101 }, () => randomUUID()),
    bedIds = Array.from({ length: 101 }, () => randomUUID());
  await fixture.connection.db.insert(roomTypes).values(
    typeIds.map((id, index) => ({
      id,
      branchId: inventory.branchId,
      name: 'Public type ' + index,
      capacity: 2,
      inventoryMode: 'both' as const,
      bedMonthlyRentPaisa: 1800001n,
      roomMonthlyRentPaisa: 3200000n,
      depositPaisa: 0n,
    })),
  );
  await fixture.connection.db
    .update(roomTypes)
    .set({ capacity: 103 })
    .where(eq(roomTypes.id, inventory.roomTypeId));
  await fixture.connection.db.insert(rooms).values(
    roomIds.map((id, index) => ({
      id,
      branchId: inventory.branchId,
      roomTypeId: inventory.roomTypeId,
      label: 'Public room ' + index,
      status: 'active' as const,
    })),
  );
  await fixture.connection.db.insert(seats).values(
    bedIds.map((id, index) => ({
      id,
      branchId: inventory.branchId,
      roomId: inventory.roomId,
      ordinal: index + 3,
      label: 'Public bed ' + index,
      status: 'active' as const,
    })),
  );
  // CHG-057: public types/rooms represent installed beds, never empty capacity presets.
  const typeRooms = typeIds.map((roomTypeId, index) => ({
    id: randomUUID(),
    branchId: inventory.branchId,
    roomTypeId,
    label: 'Type room ' + index,
    status: 'active' as const,
  }));
  await fixture.connection.db.insert(rooms).values(typeRooms);
  await fixture.connection.db.insert(seats).values(
    [...roomIds, ...typeRooms.map((room) => room.id)].map((roomId) => ({
      branchId: inventory.branchId,
      roomId,
      ordinal: 1,
      label: 'A',
      status: 'active' as const,
    })),
  );
  // ROOM-003: every traversed room and bed has its mandatory published photo.
  const photos = { bucket: fixture.storage.bucket, ownerId: fixture.ownerId, now: fixture.now };
  for (const roomId of roomIds)
    await publishInventoryPhotos(fixture.connection.db, {
      ...photos,
      branchId: inventory.branchId,
      roomId,
      seatIds: [],
    });
  await publishInventoryPhotos(fixture.connection.db, {
    ...photos,
    branchId: inventory.branchId,
    roomId: inventory.roomId,
    seatIds: bedIds,
  });
  expect(
    await walk(root(inventory.branchId) + '/room-types', (value) =>
      publicInventoryTypePageSchema.parse(value),
    ),
  ).toEqual([...typeIds, inventory.roomTypeId].sort());
  expect(
    await walk(
      root(inventory.branchId) + '/room-types/' + inventory.roomTypeId + '/rooms',
      (value) => publicInventoryRoomPageSchema.parse(value),
    ),
  ).toEqual([...roomIds, inventory.roomId].sort());
  const expected = [...bedIds, inventory.seatId, inventory.otherSeatId].sort();
  expect(
    await walk(root(inventory.branchId) + '/rooms/' + inventory.roomId + '/beds', (value) =>
      publicInventoryBedPageSchema.parse(value),
    ),
  ).toEqual(expected);
  const last = expected.at(-1);
  if (!last) throw new Error('Public page fixture missing');
  const final = await fixture.application.inject({
    url:
      root(inventory.branchId) +
      '/rooms/' +
      inventory.roomId +
      '/beds?cursor=' +
      last +
      '&limit=20',
  });
  expect(publicInventoryBedPageSchema.parse(final.json())).toEqual({
    branchId: inventory.branchId,
    roomId: inventory.roomId,
    data: [],
    nextCursor: null,
  });
  const response = await fixture.application.inject({
    url: '/v1/marketplace/' + inventory.branchId + '?moveInDate=2026-11-01&moveOutDate=2026-11-03',
  });
  expect(response.statusCode).toBe(200);
  expect(listingOverviewSchema.parse(response.json())).toMatchObject({
    priceFromPaisa: 1800000,
    availableBeds: 103,
    availableWholeRooms: 102,
  });
  expect(response.json()).not.toHaveProperty('roomTypes');
});
it('ACC-002 / ACC-001: dated public page availability reflects real blocks without revealing reasons', async () => {
  const inventory = await fixture.inventory(),
    range = { moveInDate: '2026-11-01', moveOutDate: '2026-11-03' };
  const created = await fixture.application.inject({
    method: 'POST',
    url: '/v1/branches/' + inventory.branchId + '/inventory/blocks',
    headers: { authorization: 'Bearer ' + fixture.ownerToken, 'Idempotency-Key': randomUUID() },
    payload: {
      target: { kind: 'bed', roomId: inventory.roomId, bedId: inventory.seatId },
      range,
      kind: 'maintenance',
      reason: 'Private maintenance reason',
    },
  });
  expect(created.statusCode).toBe(201);
  const query = '?moveInDate=' + range.moveInDate + '&moveOutDate=' + range.moveOutDate;
  const response = await fixture.application.inject({
    url: root(inventory.branchId) + '/rooms/' + inventory.roomId + '/beds' + query,
  });
  expect(response.statusCode).toBe(200);
  const page = publicInventoryBedPageSchema.parse(response.json());
  expect(page.data.find((row) => row.id === inventory.seatId)?.available).toBe(false);
  expect(page.data.find((row) => row.id === inventory.otherSeatId)?.available).toBe(true);
  expect(response.body).not.toContain('Private maintenance reason');
  expect(response.body).not.toContain(fixture.ownerId);
  const roomPage = await fixture.application.inject({
    url: root(inventory.branchId) + '/room-types/' + inventory.roomTypeId + '/rooms' + query,
  });
  expect(publicInventoryRoomPageSchema.parse(roomPage.json()).data[0]?.wholeRoomAvailable).toBe(
    false,
  );
  const adjacent = await fixture.application.inject({
    url:
      root(inventory.branchId) +
      '/rooms/' +
      inventory.roomId +
      '/beds?moveInDate=2026-11-03&moveOutDate=2026-11-05',
  });
  expect(
    publicInventoryBedPageSchema.parse(adjacent.json()).data.every((row) => row.available),
  ).toBe(true);
});
it('SEC-003 / ACC-002: publication withdrawal hides overview and every physical collection', async () => {
  const inventory = await fixture.inventory();
  await fixture.connection.db
    .update(branches)
    .set({ listingHiddenAt: fixture.now })
    .where(eq(branches.id, inventory.branchId));
  for (const url of [
    '/v1/marketplace/' + inventory.branchId,
    root(inventory.branchId) + '/room-types',
    root(inventory.branchId) + '/room-types/' + inventory.roomTypeId + '/rooms',
    root(inventory.branchId) + '/rooms/' + inventory.roomId + '/beds',
  ]) {
    const response = await fixture.application.inject({ url });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'NOT_FOUND' });
  }
});
it('SEC-003 / ACC-002: foreign, archived and inactive parents remain hidden; invalid cursors are rejected', async () => {
  const first = await fixture.inventory(),
    second = await fixture.inventory();
  expect(
    (
      await fixture.application.inject({
        url: root(first.branchId) + '/room-types/' + second.roomTypeId + '/rooms',
      })
    ).statusCode,
  ).toBe(404);
  expect(
    (
      await fixture.application.inject({
        url: root(first.branchId) + '/rooms/' + second.roomId + '/beds',
      })
    ).statusCode,
  ).toBe(404);
  expect(
    (await fixture.application.inject({ url: root(first.branchId) + '/room-types?cursor=bad' }))
      .statusCode,
  ).toBe(400);
  await fixture.connection.db
    .update(rooms)
    .set({ status: 'inactive' })
    .where(eq(rooms.id, first.roomId));
  expect(
    (
      await fixture.application.inject({
        url: root(first.branchId) + '/rooms/' + first.roomId + '/beds',
      })
    ).statusCode,
  ).toBe(404);
  await fixture.connection.db
    .update(roomTypes)
    .set({ archivedAt: fixture.now })
    .where(eq(roomTypes.id, second.roomTypeId));
  expect(
    (
      await fixture.application.inject({
        url: root(second.branchId) + '/rooms/' + second.roomId + '/beds',
      })
    ).statusCode,
  ).toBe(404);
});
