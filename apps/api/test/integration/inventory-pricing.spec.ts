import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import {
  roomTypePrices,
  roomTypes,
  managerAssignments,
  managerInventoryGrants,
  hostelAuditLog,
  bookings,
} from '@hsm/db';
import {
  bookingQuoteSnapshotSchema,
  bookingSummarySchema,
  roomPriceVersionSchema,
  roomPriceHistorySchema,
  listingPageSchema,
  publicInventoryTypePageSchema,
  branchInventorySchema,
  inventoryRoomTypePageSchema,
} from '@hsm/contracts';
import { AuditWriter } from '../../src/audit/writer.js';
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
const price = {
  effectiveFrom: '2000-01-01',
  bedMonthlyRentPaisa: 1900001,
  roomMonthlyRentPaisa: 3400001,
  depositPaisa: 500001,
  fees: [{ code: 'mess', cadence: 'monthly', amountPaisa: 300001 }],
};
function request(
  item: Item,
  body: Record<string, unknown> = price,
  key = randomUUID(),
  token = f.ownerToken,
) {
  return {
    method: 'POST' as const,
    url: `/v1/branches/${item.branchId}/inventory/room-types/${item.roomTypeId}/prices`,
    payload: body,
    headers: { authorization: 'Bearer ' + token, 'Idempotency-Key': key },
  };
}
async function quote(item: Item) {
  const response = await f.application.inject({
    method: 'POST',
    url: `/v1/marketplace/${item.branchId}/quote`,
    payload: {
      target: { kind: 'bed', roomId: item.roomId, bedId: item.seatId },
      range: { moveInDate: '2026-11-01', moveOutDate: '2026-12-01' },
    },
  });
  expect(response.statusCode, response.body).toBe(200);
  return bookingQuoteSnapshotSchema.parse(response.json());
}
it('BKG-004: future versions remain inactive, current dated money/fees reach every public and management projection', async () => {
  const item = await f.inventory(),
    command = request(item, { ...price, effectiveFrom: '2099-01-01' });
  const future = await f.application.inject(command);
  expect(future.statusCode, future.body).toBe(201);
  expect((await quote(item)).price.monthlyRentPaisa).toBe(1800000);
  const response = await f.application.inject(request(item));
  expect(response.statusCode, response.body).toBe(201);
  const result = roomPriceVersionSchema.parse(response.json());
  expect((await quote(item)).price).toEqual({
    monthlyRentPaisa: price.bedMonthlyRentPaisa,
    depositPaisa: price.depositPaisa,
    fees: price.fees,
  });
  const listings = await f.application.inject({
    url: `/v1/marketplace?ids=${item.branchId}&minimumRentPaisa=1900001&maximumRentPaisa=1900001`,
  });
  expect(listings.statusCode, listings.body).toBe(200);
  expect(listingPageSchema.parse(listings.json()).data[0]?.priceFromPaisa).toBe(1900001);
  const types = await f.application.inject({
    url: `/v1/marketplace/${item.branchId}/inventory/pages/room-types`,
  });
  expect(types.statusCode, types.body).toBe(200);
  expect(publicInventoryTypePageSchema.parse(types.json()).data[0]).toMatchObject({
    bedMonthlyRentPaisa: 1900001,
    depositPaisa: 500001,
  });
  const details = await f.application.inject({ url: `/v1/marketplace/${item.branchId}` });
  expect(details.statusCode, details.body).toBe(200);
  expect(details.body).toContain('1900001');
  const headers = { authorization: 'Bearer ' + f.ownerToken };
  const inventory = await f.application.inject({
    url: `/v1/branches/${item.branchId}/inventory`,
    headers,
  });
  expect(inventory.statusCode, inventory.body).toBe(200);
  expect(branchInventorySchema.parse(inventory.json()).roomTypes[0]).toMatchObject({
    depositPaisa: 500001,
    fees: price.fees,
  });
  const page = await f.application.inject({
    url: `/v1/branches/${item.branchId}/inventory/pages/room-types`,
    headers,
  });
  expect(page.statusCode, page.body).toBe(200);
  expect(inventoryRoomTypePageSchema.parse(page.json()).data[0]).toMatchObject({
    bedMonthlyRentPaisa: 1900001,
    fees: price.fees,
  });
  expect(
    await f.connection.db
      .select()
      .from(hostelAuditLog)
      .where(eq(hostelAuditLog.targetId, result.id)),
  ).toHaveLength(1);
  const base = await f.connection.db
    .select()
    .from(roomTypes)
    .where(eq(roomTypes.id, item.roomTypeId));
  expect(base[0]?.bedMonthlyRentPaisa).toBe(1800000n);
});
it('BKG-004 / ACC-006: publication is idempotent, unique per date, paginated and transactional under concurrent requests', async () => {
  const item = await f.inventory(),
    command = request(item);
  const initial = await f.application.inject(command),
    replay = await f.application.inject(command);
  expect(initial.statusCode, initial.body).toBe(201);
  expect(replay.statusCode).toBe(201);
  expect(replay.headers['idempotency-replayed']).toBe('true');
  expect(replay.json()).toEqual(initial.json());
  expect((await f.application.inject(request(item))).statusCode).toBe(409);
  const assignmentId = randomUUID();
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
  try {
    const concurrent = await Promise.all([
      f.application.inject(
        request(item, { ...price, effectiveFrom: '2099-01-01' }, randomUUID(), f.customerBToken),
      ),
      f.application.inject(request(item, { ...price, effectiveFrom: '2099-01-01' })),
    ]);
    expect(concurrent.map((r) => r.statusCode).sort()).toEqual([201, 409]);
  } finally {
    // BR-04: release the fixture Manager so later scenarios can appoint the same user.
    await f.connection.db
      .update(managerAssignments)
      .set({ status: 'deactivated', deactivatedAt: f.now })
      .where(eq(managerAssignments.id, assignmentId));
  }
  const history = await f.application.inject({
    url: command.url + '?limit=1',
    headers: command.headers,
  });
  const page = roomPriceHistorySchema.parse(history.json());
  expect(page.data[0]?.effectiveFrom).toBe('2099-01-01');
  expect(page.nextCursor).toBe('2099-01-01');
  const older = await f.application.inject({
    url: command.url + '?limit=1&cursor=' + page.nextCursor,
    headers: command.headers,
  });
  expect(roomPriceHistorySchema.parse(older.json()).data[0]?.effectiveFrom).toBe('2000-01-01');
  const next = request(item, { ...price, effectiveFrom: '2098-01-01' });
  const audit = vi
    .spyOn(AuditWriter.prototype, 'hostel')
    .mockRejectedValueOnce(new Error('Fixture audit failure'));
  try {
    expect((await f.application.inject(next)).statusCode).toBe(500);
  } finally {
    audit.mockRestore();
  }
  expect(
    await f.connection.db
      .select()
      .from(roomTypePrices)
      .where(
        and(
          eq(roomTypePrices.roomTypeId, item.roomTypeId),
          eq(roomTypePrices.effectiveFrom, '2098-01-01'),
        ),
      ),
  ).toHaveLength(0);
  expect((await f.application.inject(next)).statusCode).toBe(201);
});
it('ACC-004: both grants, live replay authorization and exact room-type scope are required', async () => {
  const item = await f.inventory(),
    other = await f.inventory(),
    assignmentId = randomUUID();
  await f.connection.db.insert(managerAssignments).values({
    id: assignmentId,
    userId: f.customerB,
    branchId: item.branchId,
    status: 'active',
    appointedByUserId: f.ownerId,
    activatedAt: f.now,
  });
  const command = request(item, price, randomUUID(), f.customerBToken);
  expect((await f.application.inject(command)).statusCode).toBe(403);
  await f.connection.db
    .insert(managerInventoryGrants)
    .values({ assignmentId, permission: 'pricing_edit', grantedAt: f.now });
  expect((await f.application.inject(command)).statusCode).toBe(403);
  await f.connection.db
    .insert(managerInventoryGrants)
    .values({ assignmentId, permission: 'inventory_edit', grantedAt: f.now });
  expect((await f.application.inject(command)).statusCode).toBe(201);
  expect(
    (await f.application.inject(request({ ...item, roomTypeId: other.roomTypeId }))).statusCode,
  ).toBe(404);
  expect(
    (
      await f.application.inject({
        url: command.url,
        headers: { authorization: 'Bearer ' + f.customerAToken },
      })
    ).statusCode,
  ).toBe(403);
  await f.connection.db
    .delete(managerInventoryGrants)
    .where(
      and(
        eq(managerInventoryGrants.assignmentId, assignmentId),
        eq(managerInventoryGrants.permission, 'pricing_edit'),
      ),
    );
  expect((await f.application.inject(command)).statusCode).toBe(403);
});
it('BKG-004: existing captured booking prices survive a new effective price; legacy edit cannot bypass dated history', async () => {
  const item = await f.inventory(),
    original = await quote(item);
  const booked = await f.application.inject({
    method: 'POST',
    url: `/v1/marketplace/${item.branchId}/bookings`,
    headers: { authorization: 'Bearer ' + f.customerAToken, 'Idempotency-Key': randomUUID() },
    payload: { quote: original, documents: [], permanentAddress: 'Fixture permanent address' },
  });
  expect(booked.statusCode, booked.body).toBe(201);
  const booking = bookingSummarySchema.parse(booked.json());
  expect(booking.state).toBe('confirmed');
  expect((await f.application.inject(request(item))).statusCode).toBe(201);
  const [stored] = await f.connection.db.select().from(bookings).where(eq(bookings.id, booking.id));
  expect(stored?.quoteSnapshot).toEqual(original);
  const update = await f.application.inject({
    method: 'PUT',
    url: `/v1/branches/${item.branchId}/inventory/room-types/${item.roomTypeId}`,
    headers: { authorization: 'Bearer ' + f.ownerToken, 'Idempotency-Key': randomUUID() },
    payload: {
      name: 'Changed name',
      inventoryMode: 'both',
      capacity: 2,
      ...price,
      effectiveFrom: undefined,
      bedMonthlyRentPaisa: 1,
    },
  });
  expect(update.statusCode).toBe(422);
  expect((await quote({ ...item, seatId: item.otherSeatId })).price.monthlyRentPaisa).toBe(1900001);
});
it('BKG-004 / AUD-001: price versions cannot be rewritten, deleted, truncated or made incompatible with inventory mode', async () => {
  const item = await f.inventory();
  const response = await f.application.inject(request(item));
  const version = roomPriceVersionSchema.parse(response.json());
  await expect(
    f.connection.db
      .update(roomTypePrices)
      .set({ depositPaisa: 1n })
      .where(eq(roomTypePrices.id, version.id)),
  ).rejects.toThrow();
  await expect(
    f.connection.db.delete(roomTypePrices).where(eq(roomTypePrices.id, version.id)),
  ).rejects.toThrow();
  await expect(f.connection.db.execute(sql`TRUNCATE ${roomTypePrices}`)).rejects.toThrow();
  const invalid = await f.application.inject(
    request(item, { ...price, effectiveFrom: '2099-01-01', bedMonthlyRentPaisa: null }),
  );
  expect(invalid.statusCode).toBe(422);
  expect(
    (await f.application.inject(request(item, { ...price, effectiveFrom: '2026-02-30' })))
      .statusCode,
  ).toBe(400);
  const [source] = await f.connection.db
    .select()
    .from(roomTypePrices)
    .where(eq(roomTypePrices.id, version.id));
  if (!source) throw new Error('Fixture price missing');
  for (const amountPaisa of [-1, 0.1])
    await expect(
      f.connection.db.insert(roomTypePrices).values({
        ...source,
        id: randomUUID(),
        effectiveFrom: '2098-01-01',
        fees: [{ code: 'mess', cadence: 'monthly', amountPaisa }],
      }),
    ).rejects.toThrow();
  const perBed = await f.inventory();
  await f.connection.db
    .update(roomTypes)
    .set({ inventoryMode: 'per_bed' })
    .where(eq(roomTypes.id, perBed.roomTypeId));
  expect(
    (await f.application.inject(request(perBed, { ...price, roomMonthlyRentPaisa: null })))
      .statusCode,
  ).toBe(201);
  await expect(
    f.connection.db
      .update(roomTypes)
      .set({ inventoryMode: 'both' })
      .where(eq(roomTypes.id, perBed.roomTypeId)),
  ).rejects.toThrow();
});
