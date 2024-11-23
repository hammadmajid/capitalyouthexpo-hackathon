import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { bedPrices, bookingHolds, roomTypes } from '@hsm/db';
import {
  bookingQuoteSnapshotSchema,
  branchInventorySchema,
  publicInventoryBedPageSchema,
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
  bed: string,
  payload: object,
  token = f.ownerToken,
  key = randomUUID(),
) {
  return f.application.inject({
    method: 'POST',
    url: `/v1/branches/${item.branchId}/inventory/beds/${bed}/prices`,
    headers: { authorization: 'Bearer ' + token, 'Idempotency-Key': key },
    payload,
  });
}
async function quote(
  item: Item,
  bedId = item.seatId,
  moveInDate = '2026-11-01',
  moveOutDate = '2026-12-01',
) {
  const response = await f.application.inject({
    method: 'POST',
    url: `/v1/marketplace/${item.branchId}/quote`,
    payload: {
      target: { kind: 'bed', roomId: item.roomId, bedId },
      range: { moveInDate, moveOutDate },
    },
  });
  expect(response.statusCode, response.body).toBe(200);
  return bookingQuoteSnapshotSchema.parse(response.json());
}
it('CHG-058 / BKG-003: independent exact-paisa bed security reaches quotes, private/public rows and same-option filters', async () => {
  const item = await f.inventory();
  await f.connection.db
    .update(roomTypes)
    .set({ inventoryMode: 'per_bed', roomMonthlyRentPaisa: null })
    .where(eq(roomTypes.id, item.roomTypeId));
  for (const [bed, amount] of [
    [item.seatId, 1000001],
    [item.otherSeatId, 2000002],
  ] as const) {
    const result = await publish(item, bed, {
      monthlyRentPaisa: 1800000,
      depositPaisa: amount,
      effectiveFrom: '2000-01-01',
    });
    expect(result.statusCode, result.body).toBe(201);
    expect((await quote(item, bed)).price.depositPaisa).toBe(amount);
  }
  const privateRead = await f.application.inject({
    url: `/v1/branches/${item.branchId}/inventory`,
    headers: { authorization: 'Bearer ' + f.ownerToken },
  });
  expect(privateRead.statusCode, privateRead.body).toBe(200);
  const beds = branchInventorySchema.parse(privateRead.json()).rooms.flatMap((room) => room.seats);
  expect(beds.find((bed) => bed.id === item.seatId)?.depositPaisa).toBe(1000001);
  const publicRead = await f.application.inject({
    url: `/v1/marketplace/${item.branchId}/inventory/pages/rooms/${item.roomId}/beds`,
  });
  expect(publicRead.statusCode, publicRead.body).toBe(200);
  expect(
    publicInventoryBedPageSchema
      .parse(publicRead.json())
      .data.find((bed) => bed.id === item.otherSeatId)?.depositPaisa,
  ).toBe(2000002);
  const types = await f.application.inject({
    url: `/v1/marketplace/${item.branchId}/inventory/pages/room-types`,
  });
  expect(types.statusCode, types.body).toBe(200);
  expect(types.json().data[0]?.depositPaisa).toBe(1000001);
  const unavailable = await f.application.inject({
    url: `/v1/marketplace?ids=${item.branchId}&optionKind=bed&maximumDepositPaisa=1000000`,
  });
  expect(unavailable.statusCode, unavailable.body).toBe(200);
  expect(unavailable.json().data).toHaveLength(0);
  const matchingQuery = new URLSearchParams({
    ids: item.branchId,
    optionKind: 'bed',
    maximumDepositPaisa: '1000001',
    availableOnly: 'true',
    moveInDate: '2026-11-01',
    moveOutDate: '2026-12-01',
  });
  const available = await f.application.inject({
    url: '/v1/marketplace?' + matchingQuery.toString(),
  });
  expect(available.statusCode, available.body).toBe(200);
  expect(available.json().data).toHaveLength(1);
});
it('CHG-058 / ACC-006: omitted security inherits, explicit zero wins, future versions stay inactive and held snapshots stay fixed', async () => {
  const item = await f.inventory();
  await f.connection.db
    .update(roomTypes)
    .set({ depositPaisa: 500001n })
    .where(eq(roomTypes.id, item.roomTypeId));
  expect((await quote(item)).price.depositPaisa).toBe(500001);
  expect(
    (
      await publish(item, item.seatId, {
        monthlyRentPaisa: 1800000,
        depositPaisa: 1000001,
        effectiveFrom: '2000-01-01',
      })
    ).statusCode,
  ).toBe(201);
  const original = await quote(item);
  const hold = await f.application.inject({
    method: 'POST',
    url: `/v1/marketplace/${item.branchId}/holds`,
    headers: { authorization: 'Bearer ' + f.customerAToken, 'Idempotency-Key': randomUUID() },
    payload: { quote: original },
  });
  expect(hold.statusCode, hold.body).toBe(201);
  expect(
    (
      await publish(item, item.seatId, {
        monthlyRentPaisa: 9999999,
        depositPaisa: 9000000,
        effectiveFrom: '2099-01-01',
      })
    ).statusCode,
  ).toBe(201);
  expect(
    (await publish(item, item.seatId, { monthlyRentPaisa: 1900000, effectiveFrom: '2000-01-02' }))
      .statusCode,
  ).toBe(201);
  expect((await quote(item, item.seatId, '2026-12-01', '2027-01-01')).price).toMatchObject({
    monthlyRentPaisa: 1900000,
    depositPaisa: 1000001,
  });
  expect(
    (
      await publish(item, item.seatId, {
        monthlyRentPaisa: 1900000,
        depositPaisa: 0,
        effectiveFrom: '2000-01-02',
      })
    ).statusCode,
  ).toBe(201);
  expect((await quote(item, item.seatId, '2026-12-01', '2027-01-01')).price.depositPaisa).toBe(0);
  const [held] = await f.connection.db
    .select()
    .from(bookingHolds)
    .where(eq(bookingHolds.id, String(hold.json().id)));
  expect(held?.quoteSnapshot).toMatchObject({
    price: { monthlyRentPaisa: 1800000, depositPaisa: 1000001 },
  });
});
it('CHG-058 / BED-001 / ACC-001: bed creation captures security atomically; replay, scope and numeric boundaries remain guarded', async () => {
  const item = await f.inventory(),
    other = await f.inventory(),
    key = randomUUID();
  const command = {
    method: 'POST' as const,
    url: `/v1/branches/${item.branchId}/inventory/rooms/${item.roomId}/seats`,
    headers: { authorization: 'Bearer ' + f.ownerToken, 'Idempotency-Key': key },
    payload: { label: 'C', status: 'active', monthlyRentPaisa: 100001, depositPaisa: 500001 },
  };
  const created = await f.application.inject(command);
  expect(created.statusCode, created.body).toBe(200);
  expect((await f.application.inject(command)).json()).toEqual(created.json());
  expect(
    await f.connection.db
      .select()
      .from(bedPrices)
      .where(eq(bedPrices.bedId, String(created.json().id))),
  ).toMatchObject([{ monthlyRentPaisa: 100001n, depositPaisa: 500001n }]);
  expect(
    (
      await publish(item, other.seatId, {
        monthlyRentPaisa: 1,
        depositPaisa: 1,
        effectiveFrom: '2000-01-01',
      })
    ).statusCode,
  ).toBe(404);
  expect(
    (
      await publish(
        item,
        item.seatId,
        { monthlyRentPaisa: 1, depositPaisa: 1, effectiveFrom: '2000-01-01' },
        f.customerAToken,
      )
    ).statusCode,
  ).toBe(403);
  for (const depositPaisa of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1])
    expect(
      (
        await publish(item, item.seatId, {
          monthlyRentPaisa: 1,
          depositPaisa,
          effectiveFrom: '2000-01-01',
        })
      ).statusCode,
    ).toBe(400);
  await expect(
    f.connection.db
      .update(bedPrices)
      .set({ depositPaisa: 1n })
      .where(eq(bedPrices.bedId, String(created.json().id))),
  ).rejects.toThrow();
});
