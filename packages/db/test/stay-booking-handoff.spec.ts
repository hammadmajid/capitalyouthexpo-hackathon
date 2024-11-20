import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { v7 } from 'uuid';
import {
  bookings,
  stays,
  stayAssignments,
  inventoryClaims,
  inventoryBlocks,
} from '../src/index.js';
import { inventoryHarness, bookingValues, claimValues } from './inventory.fixture.js';
import { financeScope, financeTime } from './resident-finance.fixture.js';
const harness = inventoryHarness();
beforeAll(() => harness.start());
afterAll(() => harness.close());
it('STAY-001 / ACC-001: confirmed reservation atomically hands inventory to the actual Stay and retains immutable booking history', async () => {
  const scope = await financeScope(harness),
    stayId = v7(),
    assignmentId = v7();
  const dates = { moveInDate: '2028-02-01', moveOutDate: '2028-03-01' };
  const booking = bookingValues(scope, dates);
  await harness.database().transaction(async (transaction) => {
    await transaction.insert(bookings).values(booking);
    await transaction
      .insert(inventoryClaims)
      .values(claimValues(scope, { bookingId: booking.id }, dates));
  });
  await harness.database().transaction(async (transaction) => {
    await transaction.insert(stays).values({
      id: stayId,
      branchId: scope.branchId,
      residentId: scope.residentId,
      userId: scope.customerA,
      bookingId: booking.id,
      source: 'booking',
      state: 'active',
      moveInDate: dates.moveInDate,
      expectedLeaveDate: dates.moveOutDate,
      checkedInAt: financeTime,
      createdByUserId: scope.ownerId,
    });
    await transaction
      .update(inventoryClaims)
      .set({ releasedAt: financeTime })
      .where(eq(inventoryClaims.bookingId, booking.id));
    await transaction.insert(stayAssignments).values({
      id: assignmentId,
      branchId: scope.branchId,
      stayId,
      roomTypeId: scope.roomTypeId,
      roomId: scope.roomId,
      seatId: scope.seatId,
      seatOrdinal: 1,
      startedAt: financeTime,
      reason: 'Booking handoff constraint fixture',
      createdByUserId: scope.ownerId,
    });
    await transaction
      .insert(inventoryClaims)
      .values({ ...claimValues(scope, {}, dates), assignmentId });
  });
  const [retained] = await harness
    .database()
    .select()
    .from(bookings)
    .where(eq(bookings.id, booking.id));
  expect(retained?.state).toBe('confirmed');
  expect(retained?.quoteSnapshot).toEqual(booking.quoteSnapshot);
  expect(
    await harness
      .database()
      .select()
      .from(inventoryClaims)
      .where(
        and(eq(inventoryClaims.assignmentId, assignmentId), isNull(inventoryClaims.releasedAt)),
      ),
  ).toHaveLength(1);
  await expect(
    harness
      .database()
      .update(bookings)
      .set({ state: 'cancelled' })
      .where(eq(bookings.id, booking.id)),
  ).rejects.toThrow();
  const endedAt = new Date('2028-02-10T06:00:00Z');
  await harness.database().transaction(async (transaction) => {
    await transaction
      .update(stayAssignments)
      .set({ endedAt })
      .where(eq(stayAssignments.id, assignmentId));
    await transaction
      .update(inventoryClaims)
      .set({ releasedAt: endedAt })
      .where(eq(inventoryClaims.assignmentId, assignmentId));
    await transaction
      .update(stays)
      .set({ state: 'completed', closedAt: endedAt, version: 2 })
      .where(eq(stays.id, stayId));
  });
  expect(
    await harness
      .database()
      .select()
      .from(inventoryClaims)
      .where(and(eq(inventoryClaims.bookingId, booking.id), isNull(inventoryClaims.releasedAt))),
  ).toHaveLength(0);
  expect(
    await harness.database().select().from(bookings).where(eq(bookings.id, booking.id)),
  ).toHaveLength(1);
});
it('ACC-001: legacy block claims cannot bypass finite-period requirements through SQL NULL check semantics', async () => {
  const scope = await harness.scope(),
    blockId = v7();
  await expect(
    harness.database().transaction(async (transaction) => {
      await transaction.insert(inventoryBlocks).values({
        id: blockId,
        branchId: scope.branchId,
        roomId: scope.roomId,
        moveInDate: '2028-02-01',
        moveOutDate: '2028-03-01',
        reason: 1,
        createdByUserId: scope.ownerId,
      });
      await transaction.insert(inventoryClaims).values({
        blockId,
        branchId: scope.branchId,
        roomId: scope.roomId,
        moveInDate: '2028-02-01',
        moveOutDate: null,
      });
    }),
  ).rejects.toThrow();
  expect(
    await harness.database().select().from(inventoryBlocks).where(eq(inventoryBlocks.id, blockId)),
  ).toHaveLength(0);
});
