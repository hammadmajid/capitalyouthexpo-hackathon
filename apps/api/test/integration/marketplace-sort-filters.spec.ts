import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { roomTypeFees, roomTypes, seats } from '@hsm/db';
import { marketplacePageSchema, publicInventoryTypePageSchema } from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
let f: Awaited<ReturnType<typeof phaseTwoFixture>>;
type Item = Awaited<ReturnType<typeof f.inventory>>;
const items: Item[] = [];
beforeAll(async () => {
  f = await phaseTwoFixture(new Date('2026-10-25T10:00:00Z'), undefined, {
    preScannedInventory: true,
  });
  // Three hostels with distinct rent, deposit and seater so every sort and filter is observable.
  for (const [rent, deposit, capacity] of [
    [1500000n, 0n, 2],
    [2500000n, 900000n, 3],
    [2000000n, 300000n, 2],
  ] as const) {
    const item = await f.inventory();
    await f.connection.db
      .update(roomTypes)
      .set({
        bedMonthlyRentPaisa: rent,
        roomMonthlyRentPaisa: rent * 2n,
        depositPaisa: deposit,
        capacity,
      })
      .where(eq(roomTypes.id, item.roomTypeId));
    if (capacity === 3)
      await f.connection.db.insert(seats).values({
        branchId: item.branchId,
        roomId: item.roomId,
        ordinal: 3,
        label: 'C',
        status: 'maintenance',
      });
    items.push(item);
  }
});
afterAll(async () => {
  await f?.close();
});
async function search(query: string) {
  const ids = items.map((item) => item.branchId).join(',');
  const response = await f.application.inject({ url: `/v1/marketplace?ids=${ids}&${query}` });
  expect(response.statusCode, response.body).toBe(200);
  return marketplacePageSchema.parse(response.json());
}
const [cheap, dear, middle] = [0, 1, 2];
const branch = (index: number) => items[index]?.branchId;
it('p.13: price sorts follow actual selectable prices and continue with exact keyset cursors', async () => {
  const ascending = await search('sort=price_asc&limit=2');
  expect(ascending.data.map((row) => row.branchId)).toEqual([branch(cheap), branch(middle)]);
  expect(ascending.nextCursor).toMatch(/^price_asc:2000000:/);
  const rest = await search(`sort=price_asc&limit=2&cursor=${ascending.nextCursor ?? ''}`);
  expect(rest.data.map((row) => row.branchId)).toEqual([branch(dear)]);
  expect(rest.nextCursor).toBeNull();
  const descending = await search('sort=price_desc&limit=3');
  expect(descending.data.map((row) => row.branchId)).toEqual([
    branch(dear),
    branch(middle),
    branch(cheap),
  ]);
  expect(
    (await f.application.inject({ url: '/v1/marketplace?sort=price_desc&cursor=' + randomUUID() }))
      .statusCode,
  ).toBe(400);
});
it('p.13: deposit, seater and option filters must match the same option', async () => {
  expect(
    (await search('maximumDepositPaisa=300000')).data.map((row) => row.branchId).sort(),
  ).toEqual([branch(cheap), branch(middle)].sort());
  expect((await search('capacity=3')).data.map((row) => row.branchId)).toEqual([branch(dear)]);
  expect(
    (await search('optionKind=room&maximumRentPaisa=3500000')).data.map((row) => row.branchId),
  ).toEqual([branch(cheap)]);
  expect((await search('capacity=3&maximumDepositPaisa=300000')).data).toEqual([]);
});
it('p.13: Most available needs dates and counts only real selectable options', async () => {
  expect(
    (await f.application.inject({ url: '/v1/marketplace?sort=most_available' })).statusCode,
  ).toBe(400);
  const page = await search('sort=most_available&moveInDate=2026-11-01&moveOutDate=2026-12-01');
  expect(page.data).toHaveLength(3);
  expect(page.data.every((row) => row.availableBeds === 2)).toBe(true);
  const recommended = await search('sort=recommended&moveInDate=2026-11-01&moveOutDate=2026-12-01');
  expect(recommended.data).toHaveLength(3);
});
it('BKG-003 / BKG-005: public room types disclose the fees quotes will charge', async () => {
  const item = items[cheap];
  if (!item) throw new Error('Fixture missing');
  await f.connection.db.insert(roomTypeFees).values({
    branchId: item.branchId,
    roomTypeId: item.roomTypeId,
    code: 'mess',
    cadence: 'monthly',
    amountPaisa: 600000n,
  });
  const response = await f.application.inject({
    url: `/v1/marketplace/${item.branchId}/inventory/pages/room-types`,
  });
  expect(response.statusCode, response.body).toBe(200);
  expect(publicInventoryTypePageSchema.parse(response.json()).data[0]?.fees).toEqual([
    { code: 'mess', cadence: 'monthly', amountPaisa: 600000 },
  ]);
});
