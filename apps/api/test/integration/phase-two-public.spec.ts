import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { branches } from '@hsm/db';
import {
  listingPageSchema,
  listingDetailsSchema,
  branchInventorySchema,
  publicInventoryTypePageSchema,
  publicInventoryRoomPageSchema,
  publicInventoryBedPageSchema,
} from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
let fixture: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  fixture = await phaseTwoFixture(new Date('2026-10-14T12:00:00Z'));
});
afterAll(async () => {
  await fixture?.close();
});
it('ACC-002: anonymous marketplace exposes only approved inventory and no personal data', async () => {
  const inventory = await fixture.inventory();
  const response = await fixture.application.inject({
    url: `/v1/marketplace?ids=${inventory.branchId}`,
  });
  expect(response.statusCode).toBe(200);
  const page = listingPageSchema.parse(response.json());
  expect(page.data).toHaveLength(1);
  expect(page.data[0]).toMatchObject({
    branchId: inventory.branchId,
    verified: true,
    priceFromPaisa: 1800000,
    availableBeds: null,
    availableWholeRooms: null,
  });
  for (const privateValue of [
    fixture.ownerId,
    fixture.customerA,
    fixture.customerB,
    fixture.ownerToken,
    fixture.customerAToken,
  ])
    expect(response.body).not.toContain(privateValue);
  expect(response.headers['cache-control']).toBe('no-store');
});
it('ACC-002: withdrawn listings disappear from direct details and recent IDs', async () => {
  const inventory = await fixture.inventory();
  await fixture.connection.db
    .update(branches)
    .set({ listingHiddenAt: fixture.now })
    .where(eq(branches.id, inventory.branchId));
  const details = await fixture.application.inject({
    url: `/v1/marketplace/${inventory.branchId}`,
  });
  expect(details.statusCode).toBe(404);
  const list = await fixture.application.inject({
    url: `/v1/marketplace?ids=${inventory.branchId}`,
  });
  expect(list.statusCode).toBe(200);
  expect(listingPageSchema.parse(list.json()).data).toHaveLength(0);
});
it('ACC-004: Customer cannot read management inventory even with an exact branch ID', async () => {
  const inventory = await fixture.inventory();
  const url = `/v1/branches/${inventory.branchId}/inventory`;
  expect((await fixture.application.inject({ url })).statusCode).toBe(401);
  expect(
    (
      await fixture.application.inject({
        url,
        headers: { authorization: `Bearer ${fixture.customerAToken}` },
      })
    ).statusCode,
  ).toBe(403);
  const owner = await fixture.application.inject({
    url,
    headers: { authorization: `Bearer ${fixture.ownerToken}` },
  });
  expect(owner.statusCode).toBe(200);
  const projection = branchInventorySchema.parse(owner.json());
  expect(projection.canConfigureManagers).toBe(true);
  expect(projection.roomTypes).toHaveLength(1);
  expect(projection.roomTypes.every((type) => type.branchId === inventory.branchId)).toBe(true);
  expect(projection.rooms.every((room) => room.branchId === inventory.branchId)).toBe(true);
});
it('ACC-002: public details page physical options without claiming undated availability', async () => {
  const inventory = await fixture.inventory();
  const root = `/v1/marketplace/${inventory.branchId}`;
  const response = await fixture.application.inject({ url: root });
  expect(response.statusCode).toBe(200);
  const details = listingDetailsSchema.parse(response.json());
  expect(details.availableBeds).toBeNull();
  expect(details.availableWholeRooms).toBeNull();
  expect(details).not.toHaveProperty('roomTypes');
  const typeRead = await fixture.application.inject({
    url: root + '/inventory/pages/room-types?limit=20',
  });
  expect(typeRead.statusCode).toBe(200);
  expect(publicInventoryTypePageSchema.parse(typeRead.json()).data).toHaveLength(1);
  const roomRead = await fixture.application.inject({
    url: root + '/inventory/pages/room-types/' + inventory.roomTypeId + '/rooms?limit=20',
  });
  expect(roomRead.statusCode).toBe(200);
  const roomPage = publicInventoryRoomPageSchema.parse(roomRead.json());
  expect(roomPage.data).toHaveLength(1);
  expect(roomPage.data[0]?.wholeRoomAvailable).toBeNull();
  const bedRead = await fixture.application.inject({
    url: root + '/inventory/pages/rooms/' + inventory.roomId + '/beds?limit=20',
  });
  expect(bedRead.statusCode).toBe(200);
  const bedPage = publicInventoryBedPageSchema.parse(bedRead.json());
  expect(bedPage.data).toHaveLength(2);
  expect(bedPage.data.every((bed) => bed.available === null)).toBe(true);
});
