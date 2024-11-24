import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { branches, rooms, roomTypes, seats } from '@hsm/db';
import {
  bookingQuoteSnapshotSchema,
  bookingSummarySchema,
  holdResponseSchema,
  marketplaceQuerySchema,
} from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
import { MarketplaceRepository } from '../../src/marketplace/repository.js';
import { publicInventory } from '../../src/marketplace/inventory.js';
import { publicDiscoveryQuery } from '../../src/marketplace/discovery-query.js';
let fixture: Awaited<ReturnType<typeof phaseTwoFixture>>,
  time = new Date('2026-10-17T10:00:00Z').getTime();
beforeAll(async () => {
  fixture = await phaseTwoFixture(new Date(time), () => new Date(time));
});
afterAll(async () => {
  await fixture?.close();
});
const range = { moveInDate: '2026-11-01', moveOutDate: '2026-11-03' };
async function compare(branchId: string, input: Record<string, unknown> = {}) {
  const query = marketplaceQuerySchema.parse({ ids: branchId, ...input }),
    now = new Date(time);
  const repository = new MarketplaceRepository(
    fixture.connection.db,
    fixture.storage.bucket,
    5000,
    () => now,
  );
  const actual = await repository.list(query);
  const reference = await fixture.connection.db.transaction((database) =>
    publicInventory(database, branchId, query, now),
  );
  expect(actual.data).toHaveLength(1);
  const summary = actual.data[0];
  if (!summary) throw new Error('Missing actual aggregate summary');
  expect(summary).toMatchObject({
    branchId,
    verified: true,
    priceFromPaisa: reference.priceFromPaisa,
    availableBeds: reference.availableBeds,
    availableWholeRooms: reference.availableWholeRooms,
  });
  expect(summary).not.toHaveProperty('roomTypes');
  for (const privateValue of [
    fixture.ownerId,
    fixture.customerA,
    fixture.customerB,
    fixture.ownerToken,
  ])
    expect(JSON.stringify(summary)).not.toContain(privateValue);
  return summary;
}
async function hold(inventory: Awaited<ReturnType<typeof fixture.inventory>>, whole = false) {
  const quoted = await fixture.application.inject({
    method: 'POST',
    url: '/v1/marketplace/' + inventory.branchId + '/quote',
    payload: {
      target: whole
        ? { kind: 'room', roomId: inventory.roomId }
        : { kind: 'bed', roomId: inventory.roomId, bedId: inventory.seatId },
      range,
    },
  });
  expect(quoted.statusCode).toBe(200);
  const result = await fixture.application.inject({
    method: 'POST',
    url: '/v1/marketplace/' + inventory.branchId + '/holds',
    headers: { authorization: 'Bearer ' + fixture.customerAToken, 'Idempotency-Key': randomUUID() },
    payload: { quote: bookingQuoteSnapshotSchema.parse(quoted.json()) },
  });
  expect(result.statusCode).toBe(201);
  return holdResponseSchema.parse(result.json());
}
it('ACC-002 / BKG-004: real aggregates match existing inventory semantics for modes, filters, archives and integer prices', async () => {
  const inventory = await fixture.inventory();
  for (const mode of ['both', 'per_bed', 'whole_room'] as const) {
    await fixture.connection.db
      .update(roomTypes)
      .set({
        inventoryMode: mode,
        bedMonthlyRentPaisa: mode === 'whole_room' ? null : 1800001n,
        roomMonthlyRentPaisa: mode === 'per_bed' ? null : 3200000n,
      })
      .where(eq(roomTypes.id, inventory.roomTypeId));
    await compare(inventory.branchId);
    await compare(inventory.branchId, range);
    await compare(inventory.branchId, {
      ...range,
      minimumRentPaisa: 1800001,
      maximumRentPaisa: 3200000,
    });
  }
  await fixture.connection.db
    .update(seats)
    .set({ status: 'maintenance' })
    .where(eq(seats.id, inventory.otherSeatId));
  expect((await compare(inventory.branchId, range)).availableWholeRooms).toBe(0);
  await fixture.connection.db
    .update(seats)
    .set({ archivedAt: new Date(time) })
    .where(eq(seats.id, inventory.otherSeatId));
  expect((await compare(inventory.branchId, range)).availableWholeRooms).toBe(1);
  await fixture.connection.db
    .update(rooms)
    .set({ status: 'inactive' })
    .where(eq(rooms.id, inventory.roomId));
  expect((await compare(inventory.branchId, range)).priceFromPaisa).toBeNull();
});
it('ACC-001 / BKG-006: real held bed blocks whole room, half-open boundary and exact expiry restore availability', async () => {
  const inventory = await fixture.inventory(),
    foreign = await fixture.inventory(),
    held = await hold(inventory);
  const current = await compare(inventory.branchId, range);
  expect(current.availableBeds).toBe(1);
  expect(current.availableWholeRooms).toBe(0);
  expect((await compare(foreign.branchId, range)).availableBeds).toBe(2);
  expect(
    (await compare(inventory.branchId, { ...range, availableOnly: 'true' })).priceFromPaisa,
  ).toBe(1800000);
  expect(
    (
      await compare(inventory.branchId, {
        moveInDate: range.moveOutDate,
        moveOutDate: '2026-11-05',
      })
    ).availableBeds,
  ).toBe(2);
  const before = time;
  time = new Date(held.expiresAt).getTime();
  try {
    const expired = await compare(inventory.branchId, range);
    expect(expired.availableBeds).toBe(2);
    expect(expired.availableWholeRooms).toBe(1);
  } finally {
    time = before;
  }
});
it('ACC-001: a real whole-room hold blocks all beds; a released claim does not block the aggregate', async () => {
  const inventory = await fixture.inventory(),
    held = await hold(inventory, true);
  const current = await compare(inventory.branchId, range);
  expect(current.availableBeds).toBe(0);
  expect(current.availableWholeRooms).toBe(0);
  const created = await fixture.application.inject({
    method: 'POST',
    url: '/v1/marketplace/' + inventory.branchId + '/bookings',
    headers: { authorization: 'Bearer ' + fixture.customerAToken, 'Idempotency-Key': randomUUID() },
    payload: { quote: held.quote, holdId: held.id, documents: [] },
  });
  expect(created.statusCode).toBe(201);
  const booking = bookingSummarySchema.parse(created.json());
  const cancelled = await fixture.application.inject({
    method: 'POST',
    url: '/v1/me/bookings/' + booking.id + '/cancel',
    headers: { authorization: 'Bearer ' + fixture.customerAToken, 'Idempotency-Key': randomUUID() },
    payload: { reason: 'Fixture cancellation' },
  });
  expect(cancelled.statusCode).toBe(200);
  const released = await compare(inventory.branchId, range);
  expect(released.availableBeds).toBe(2);
  expect(released.availableWholeRooms).toBe(1);
});
it('ACC-002: current parent visibility and recent-ID selection are enforced in the real aggregate statement', async () => {
  const inventory = await fixture.inventory(),
    repository = new MarketplaceRepository(
      fixture.connection.db,
      fixture.storage.bucket,
      5000,
      () => new Date(time),
    );
  await compare(inventory.branchId);
  for (const visibility of [
    { listingHiddenAt: new Date(time) },
    { listingHiddenAt: null, verificationStatus: 'rejected' as const },
  ]) {
    await fixture.connection.db
      .update(branches)
      .set(visibility)
      .where(eq(branches.id, inventory.branchId));
    expect(
      (await repository.list(marketplaceQuerySchema.parse({ ids: inventory.branchId }))).data,
    ).toEqual([]);
  }
});
it('ACC-002 / PERF: real PostgreSQL executes the bounded aggregate and produces an explainable plan without private row output', async () => {
  const inventory = await fixture.inventory(),
    query = marketplaceQuerySchema.parse({ ids: inventory.branchId, ...range });
  const statement = publicDiscoveryQuery(
    fixture.connection.db,
    query,
    new Date(time),
    5000,
    fixture.storage.bucket,
  );
  const rows = await statement;
  expect(rows).toHaveLength(1);
  const plan = await fixture.connection.db.execute(
    sql`explain (analyze, buffers, format json) ${statement.getSQL()}`,
  );
  expect(plan).toHaveLength(1);
  expect(JSON.stringify(plan)).toContain('Plan');
  const [result] = rows;
  expect(result).not.toHaveProperty('roomTypes');
  expect(result).not.toHaveProperty('customerId');
});
