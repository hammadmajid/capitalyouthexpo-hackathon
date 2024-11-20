import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { v7 } from 'uuid';
import {
  bookings,
  bookingHolds,
  inventoryClaims,
  inventoryBlocks,
  expireRoomReservations,
  sweepExpiredInventory,
  rooms,
  seats,
  roomTypes,
  bookingPolicies,
} from '../src/index.js';
import {
  inventoryHarness,
  bookingValues,
  claimValues,
  stay,
  type InventoryFixture,
} from './inventory.fixture.js';
const harness = inventoryHarness();
const database = harness.database;
beforeAll(() => harness.start());
afterAll(() => harness.close());
async function reserve(
  scope: InventoryFixture,
  patch: Partial<typeof bookings.$inferInsert> = {},
  claimPatch: Partial<typeof inventoryClaims.$inferInsert> = {},
) {
  const booking = bookingValues(scope, patch);
  await database().transaction(async (transaction) => {
    await transaction.insert(bookings).values(booking);
    await transaction
      .insert(inventoryClaims)
      .values(claimValues(scope, { bookingId: booking.id }, claimPatch));
  });
  return booking;
}
it('ACC-001 BKG-004: two concurrent customers requesting one bed yield exactly one booking', async () => {
  const scope = await harness.scope();
  const results = await Promise.allSettled([
    reserve(scope),
    reserve(scope, { customerUserId: scope.customerB }),
  ]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  expect(
    await database().select().from(bookings).where(eq(bookings.roomId, scope.roomId)),
  ).toHaveLength(1);
  expect(
    await database().select().from(inventoryClaims).where(eq(inventoryClaims.roomId, scope.roomId)),
  ).toHaveLength(1);
});
it.each(['bed', 'room'] as const)(
  'ACC-001: %s first blocks the overlapping inverse whole-room/bed target',
  async (first) => {
    const scope = await harness.scope();
    const whole = { seatId: null },
      wholeClaim = { seatId: null, seatOrdinal: null };
    await reserve(scope, first === 'room' ? whole : {}, first === 'room' ? wholeClaim : {});
    await expect(
      reserve(scope, first === 'bed' ? whole : {}, first === 'bed' ? wholeClaim : {}),
    ).rejects.toThrow();
  },
);
it('ACC-001: distinct beds and half-open adjacent stays are available', async () => {
  const scope = await harness.scope();
  await reserve(scope);
  await reserve(
    scope,
    { seatId: scope.otherSeatId },
    { seatId: scope.otherSeatId, seatOrdinal: 2 },
  );
  const next = { moveInDate: stay.moveOutDate, moveOutDate: '2027-03-01' };
  await reserve(scope, next, next);
  expect(
    await database().select().from(bookings).where(eq(bookings.roomId, scope.roomId)),
  ).toHaveLength(3);
});
it('BKG-004: active booking cannot commit without its exact inventory claim', async () => {
  const scope = await harness.scope();
  await expect(database().insert(bookings).values(bookingValues(scope))).rejects.toThrow();
  await expect(reserve(scope, {}, { seatId: scope.otherSeatId, seatOrdinal: 2 })).rejects.toThrow();
  await expect(reserve(scope, {}, { moveOutDate: '2027-03-01' })).rejects.toThrow();
  await expect(reserve(scope, {}, { seatOrdinal: 2 })).rejects.toThrow();
  expect(
    await database().select().from(bookings).where(eq(bookings.roomId, scope.roomId)),
  ).toHaveLength(0);
});
it('ACC-004: child room, bed and policy parents cannot cross branches', async () => {
  const a = await harness.scope(),
    b = await harness.scope();
  await expect(
    database()
      .insert(rooms)
      .values({ branchId: a.branchId, roomTypeId: b.roomTypeId, label: 'Wrong', status: 'active' }),
  ).rejects.toThrow();
  await expect(reserve(a, { seatId: b.seatId })).rejects.toThrow();
  await expect(
    database().insert(bookingPolicies).values({
      branchId: a.branchId,
      roomTypeId: b.roomTypeId,
      policy: {},
      isCurrent: false,
      createdByUserId: a.ownerId,
    }),
  ).rejects.toThrow();
});
it('BKG-004: historical snapshots, dates, customer and target remain immutable after Owner price changes', async () => {
  const scope = await harness.scope(),
    booking = await reserve(scope);
  await database()
    .update(roomTypes)
    .set({ bedMonthlyRentPaisa: 2000000n })
    .where(eq(roomTypes.id, scope.roomTypeId));
  for (const patch of [
    { quoteSnapshot: { price: { monthlyRentPaisa: 2000000 } } },
    { moveOutDate: '2027-03-01' },
    { customerUserId: scope.customerB },
    { seatId: scope.otherSeatId },
  ])
    await expect(
      database().update(bookings).set(patch).where(eq(bookings.id, booking.id)),
    ).rejects.toThrow();
  const [row] = await database().select().from(bookings).where(eq(bookings.id, booking.id));
  expect(row?.quoteSnapshot).toEqual(booking.quoteSnapshot);
  await expect(database().delete(bookings).where(eq(bookings.id, booking.id))).rejects.toThrow();
});
it('BKG-004: cancellation releases inventory atomically and terminal state cannot be revived', async () => {
  const scope = await harness.scope(),
    booking = await reserve(scope);
  await expect(
    database()
      .update(inventoryClaims)
      .set({ releasedAt: new Date() })
      .where(eq(inventoryClaims.bookingId, booking.id)),
  ).rejects.toThrow();
  await database().transaction(async (transaction) => {
    await transaction
      .update(bookings)
      .set({ state: 'cancelled' })
      .where(eq(bookings.id, booking.id));
    await transaction
      .update(inventoryClaims)
      .set({ releasedAt: new Date() })
      .where(eq(inventoryClaims.bookingId, booking.id));
  });
  await reserve(scope, { customerUserId: scope.customerB });
  await expect(
    database().update(bookings).set({ state: 'confirmed' }).where(eq(bookings.id, booking.id)),
  ).rejects.toThrow();
});
it('ACC-001 / BKG-004: release preserves generated ranges without permitting claim terms to change', async () => {
  const scope = await harness.scope(),
    booking = await reserve(scope);
  const [before] = await database()
    .select()
    .from(inventoryClaims)
    .where(eq(inventoryClaims.bookingId, booking.id));
  expect(before).toBeDefined();
  await expect(
    database()
      .update(inventoryClaims)
      .set({ moveOutDate: '2027-03-01' })
      .where(eq(inventoryClaims.bookingId, booking.id)),
  ).rejects.toThrow();
  await database().transaction(async (transaction) => {
    await transaction
      .update(bookings)
      .set({ state: 'cancelled' })
      .where(eq(bookings.id, booking.id));
    await transaction
      .update(inventoryClaims)
      .set({ releasedAt: new Date() })
      .where(eq(inventoryClaims.bookingId, booking.id));
  });
  const [after] = await database()
    .select()
    .from(inventoryClaims)
    .where(eq(inventoryClaims.bookingId, booking.id));
  expect(after?.releasedAt).toBeInstanceOf(Date);
  expect(after?.stayRange).toBe(before?.stayRange);
  expect(after?.slotRange).toBe(before?.slotRange);
  await expect(
    database()
      .update(inventoryClaims)
      .set({ releasedAt: null })
      .where(eq(inventoryClaims.bookingId, booking.id)),
  ).rejects.toThrow();
});
it('BKG-004: non-reserving requests coexist but only one approval can claim the bed', async () => {
  const scope = await harness.scope();
  const requests = [scope.customerA, scope.customerB].map((customerUserId) =>
    bookingValues(scope, {
      customerUserId,
      state: 'pending_request',
      requestExpiresAt: new Date(Date.now() + 600000),
      quoteSnapshot: { policy: { requestReservesInventory: false } },
    }),
  );
  await database().insert(bookings).values(requests);
  const results = await Promise.allSettled(
    requests.map((request) =>
      database().transaction(async (transaction) => {
        await transaction
          .update(bookings)
          .set({ state: 'confirmed' })
          .where(eq(bookings.id, request.id));
        await transaction
          .insert(inventoryClaims)
          .values(claimValues(scope, { bookingId: request.id }));
      }),
    ),
  );
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
});
it('BKG-006: hold release and booking claim transfer commit together; other customers cannot borrow it', async () => {
  const scope = await harness.scope(),
    holdId = v7();
  const expiresAt = new Date(Date.now() + 600000);
  await database().transaction(async (transaction) => {
    await transaction.insert(bookingHolds).values({
      id: holdId,
      branchId: scope.branchId,
      roomId: scope.roomId,
      seatId: scope.seatId,
      customerUserId: scope.customerA,
      ...stay,
      expiresAt,
      policyVersionId: scope.policyId,
      quoteSnapshot: {},
    });
    await transaction.insert(inventoryClaims).values(claimValues(scope, { holdId }, { expiresAt }));
  });
  await expect(reserve(scope, { customerUserId: scope.customerB, holdId })).rejects.toThrow();
  await expect(reserve(scope)).rejects.toThrow();
  const booking = bookingValues(scope, { holdId, quoteSnapshot: {} });
  await database().transaction(async (transaction) => {
    await transaction
      .update(bookingHolds)
      .set({ releasedAt: new Date() })
      .where(eq(bookingHolds.id, holdId));
    await transaction
      .update(inventoryClaims)
      .set({ releasedAt: new Date() })
      .where(eq(inventoryClaims.holdId, holdId));
    await transaction.insert(bookings).values(booking);
    await transaction.insert(inventoryClaims).values(claimValues(scope, { bookingId: booking.id }));
  });
  expect(await database().select().from(bookings).where(eq(bookings.id, booking.id))).toHaveLength(
    1,
  );
});
it.each([1, 2])(
  'ACC-001: manual/maintenance block reason %i protects real inventory',
  async (reason) => {
    const scope = await harness.scope(),
      blockId = v7();
    await database().transaction(async (transaction) => {
      await transaction.insert(inventoryBlocks).values({
        id: blockId,
        branchId: scope.branchId,
        roomId: scope.roomId,
        seatId: null,
        ...stay,
        reason,
        createdByUserId: scope.ownerId,
      });
      await transaction
        .insert(inventoryClaims)
        .values(claimValues(scope, { blockId }, { seatId: null, seatOrdinal: null }));
    });
    await expect(reserve(scope)).rejects.toThrow();
  },
);
it('ACC-001: room size grows with physical beds while bed ordinals remain immutable', async () => {
  const scope = await harness.scope();
  await database().insert(seats).values({
    branchId: scope.branchId,
    roomId: scope.roomId,
    ordinal: 3,
    label: 'Third',
    status: 'active',
  });
  await expect(
    database().update(roomTypes).set({ capacity: 1 }).where(eq(roomTypes.id, scope.roomTypeId)),
  ).rejects.toThrow();
  await expect(
    database().update(seats).set({ ordinal: 3 }).where(eq(seats.id, scope.seatId)),
  ).rejects.toThrow();
});
it('ACC-001: generated ranges and required GiST extension are real PostgreSQL artifacts', async () => {
  const scope = await harness.scope();
  await reserve(scope);
  const rows = await database().execute<{ extension: boolean; constraints: number }>(sql`
    select exists(select 1 from pg_extension where extname = 'btree_gist') as extension,
    (select count(*)::integer from pg_constraint where conname = 'inventory_claims_no_overlap' and contype = 'x') as constraints`);
  expect(rows[0]).toEqual({ extension: true, constraints: 1 });
  const [claim] = await database()
    .select()
    .from(inventoryClaims)
    .where(eq(inventoryClaims.roomId, scope.roomId));
  expect(claim?.slotRange).toBe('[1,2)');
  expect(claim?.stayRange).toBe('[2027-01-01,2027-02-01)');
});

it('BKG-001: real database rejects a fourth active non-reserving request', async () => {
  const scope = await harness.scope();
  const pending = () =>
    bookingValues(scope, {
      state: 'pending_request',
      requestExpiresAt: new Date(Date.now() + 600000),
      quoteSnapshot: { policy: { requestReservesInventory: false } },
    });
  await database().insert(bookings).values([pending(), pending(), pending()]);
  await expect(database().insert(bookings).values(pending())).rejects.toThrow();
});
it('BKG-006: expired hold is released by the booking transaction with its audit even when worker is down', async () => {
  const scope = await harness.scope(),
    holdId = v7(),
    expiresAt = new Date(Date.now() + 1000);
  await database().transaction(async (transaction) => {
    await transaction.insert(bookingHolds).values({
      id: holdId,
      branchId: scope.branchId,
      roomId: scope.roomId,
      seatId: scope.seatId,
      customerUserId: scope.customerA,
      ...stay,
      expiresAt,
      policyVersionId: scope.policyId,
      quoteSnapshot: {},
    });
    await transaction.insert(inventoryClaims).values(claimValues(scope, { holdId }, { expiresAt }));
  });
  const now = new Date(expiresAt.getTime());
  await database().transaction(async (transaction) => {
    await transaction.select().from(rooms).where(eq(rooms.id, scope.roomId)).for('update');
    expect(await expireRoomReservations(transaction, scope.roomId, now)).toBe(1);
  });
  await reserve(scope, { customerUserId: scope.customerB });
  const [hold] = await database().select().from(bookingHolds).where(eq(bookingHolds.id, holdId));
  expect(hold?.releasedAt).toEqual(now);
  expect(await sweepExpiredInventory(database(), now)).toBe(0);
});
it('BKG-006: worker sweep expires reserving and non-reserving requests without deleting history', async () => {
  const scope = await harness.scope(),
    requestExpiresAt = new Date(Date.now() + 1000);
  const reserving = bookingValues(scope, { state: 'pending_request', requestExpiresAt });
  const nonReserving = bookingValues(scope, {
    state: 'pending_request',
    requestExpiresAt,
    quoteSnapshot: { policy: { requestReservesInventory: false } },
  });
  await database().transaction(async (transaction) => {
    await transaction.insert(bookings).values([reserving, nonReserving]);
    await transaction
      .insert(inventoryClaims)
      .values(claimValues(scope, { bookingId: reserving.id }, { expiresAt: requestExpiresAt }));
  });
  expect(await sweepExpiredInventory(database(), requestExpiresAt)).toBe(2);
  const rows = await database().select().from(bookings).where(eq(bookings.roomId, scope.roomId));
  expect(rows.map((row) => row.state)).toEqual(['expired', 'expired']);
});
