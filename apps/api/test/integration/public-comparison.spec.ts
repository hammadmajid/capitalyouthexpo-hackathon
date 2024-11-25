import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { branches, roomTypes } from '@hsm/db';
import { listingPageSchema, publicInventoryTypePageSchema } from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
let f: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  f = await phaseTwoFixture(new Date('2026-10-25T10:00:00Z'));
});
afterAll(async () => {
  await f?.close();
});
it('p.14 / ACC-002: comparison source resolves exact selected listings, current money and date-derived availability', async () => {
  const north = await f.inventory(),
    south = await f.inventory();
  await f.connection.db
    .update(roomTypes)
    .set({ bedMonthlyRentPaisa: 1900001n, depositPaisa: 500001n })
    .where(eq(roomTypes.id, south.roomTypeId));
  const range = 'moveInDate=2026-11-01&moveOutDate=2026-12-01',
    ids = [north.branchId, south.branchId];
  const response = await f.application.inject({
    url: '/v1/marketplace?ids=' + ids.join(',') + '&limit=4&' + range,
  });
  expect(response.statusCode).toBe(200);
  const page = listingPageSchema.parse(response.json());
  expect(page.data.map((listing) => listing.branchId).sort()).toEqual([...ids].sort());
  expect(page.nextCursor).toBeNull();
  expect(page.data.find((listing) => listing.branchId === south.branchId)).toMatchObject({
    priceFromPaisa: 1900001,
    availableBeds: 2,
    availableWholeRooms: 1,
  });
  const types = await f.application.inject({
    url: `/v1/marketplace/${south.branchId}/inventory/pages/room-types?limit=20&${range}`,
  });
  expect(types.statusCode).toBe(200);
  expect(publicInventoryTypePageSchema.parse(types.json()).data[0]).toMatchObject({
    bedMonthlyRentPaisa: 1900001,
    depositPaisa: 500001,
  });
  for (const value of [f.ownerId, f.customerA, f.customerB, f.ownerToken]) {
    expect(response.body).not.toContain(value);
    expect(types.body).not.toContain(value);
  }
});
it('SEC-003: a withdrawn selection disappears from current comparison source and denies its room page', async () => {
  const north = await f.inventory(),
    south = await f.inventory();
  await f.connection.db
    .update(branches)
    .set({ listingHiddenAt: f.now })
    .where(eq(branches.id, south.branchId));
  const response = await f.application.inject({
    url: '/v1/marketplace?ids=' + [north.branchId, south.branchId].join(',') + '&limit=4',
  });
  expect(response.statusCode).toBe(200);
  expect(listingPageSchema.parse(response.json()).data.map((listing) => listing.branchId)).toEqual([
    north.branchId,
  ]);
  expect(
    (
      await f.application.inject({
        url: `/v1/marketplace/${south.branchId}/inventory/pages/room-types`,
      })
    ).statusCode,
  ).toBe(404);
});
