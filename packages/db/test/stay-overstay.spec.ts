import { afterAll, beforeAll, expect, it } from 'vitest';
import { sql, eq, and, isNull } from 'drizzle-orm';
import { v7 } from 'uuid';
import {
  stays,
  stayAssignments,
  inventoryClaims,
  inventoryBlocks,
  type Database,
} from '../src/index.js';
import { inventoryHarness } from './inventory.fixture.js';
import { financeScope, type FinanceScope } from './resident-finance.fixture.js';
const harness = inventoryHarness();
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
beforeAll(() => harness.start());
afterAll(() => harness.close());
const shift = (date: string, days: number) =>
  new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
async function block(transaction: Transaction, scope: FinanceScope, start: string, end: string) {
  const id = v7();
  await transaction.insert(inventoryBlocks).values({
    id,
    branchId: scope.branchId,
    roomId: scope.roomId,
    seatId: scope.seatId,
    moveInDate: start,
    moveOutDate: end,
    reason: 1,
    createdByUserId: scope.ownerId,
  });
  await transaction.insert(inventoryClaims).values({
    blockId: id,
    branchId: scope.branchId,
    roomId: scope.roomId,
    seatId: scope.seatId,
    seatOrdinal: 1,
    moveInDate: start,
    moveOutDate: end,
  });
  return id;
}
it('RES-004 / ACC-001: actual overstay blocks current inventory after the planned period expires; future plans remain distinct', async () => {
  const scope = await financeScope(harness);
  await harness.database().transaction(async (transaction) => {
    // Stable PostgreSQL transaction time prevents a midnight race and uses the actual infrastructure clock.
    const [clock] = await transaction
      .select({
        today: sql<string>`to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Karachi','YYYY-MM-DD')`,
      })
      .from(stays)
      .where(eq(stays.id, scope.stayId))
      .limit(1);
    if (!clock) throw new Error('PostgreSQL clock unavailable');
    const today = clock.today,
      start = shift(today, -30),
      end = shift(today, -1);
    const stayId = v7(),
      assignmentId = v7(),
      startedAt = new Date(start + 'T06:00:00Z');
    // Constraint fixture only; production admission must also persist billing, history, audit and outbox.
    await transaction.insert(stays).values({
      id: stayId,
      branchId: scope.branchId,
      residentId: scope.residentId,
      userId: scope.customerA,
      source: 'manual',
      state: 'active',
      moveInDate: start,
      expectedLeaveDate: end,
      checkedInAt: startedAt,
      createdByUserId: scope.ownerId,
    });
    await transaction.insert(stayAssignments).values({
      id: assignmentId,
      branchId: scope.branchId,
      stayId,
      roomTypeId: scope.roomTypeId,
      roomId: scope.roomId,
      seatId: scope.seatId,
      seatOrdinal: 1,
      startedAt,
      reason: 'Actual overstay constraint fixture',
      createdByUserId: scope.ownerId,
    });
    await transaction.insert(inventoryClaims).values({
      branchId: scope.branchId,
      roomId: scope.roomId,
      seatId: scope.seatId,
      seatOrdinal: 1,
      assignmentId,
      moveInDate: start,
      moveOutDate: end,
    });
    await expect(
      transaction.transaction((nested) => block(nested, scope, today, shift(today, 1))),
    ).rejects.toThrow();
    await expect(
      transaction.transaction((nested) => block(nested, scope, shift(today, 1), shift(today, 2))),
    ).rejects.toThrow();
    const revisedEnd = shift(today, 2);
    await transaction
      .update(stays)
      .set({ expectedLeaveDate: revisedEnd, version: 2 })
      .where(eq(stays.id, stayId));
    await transaction
      .update(inventoryClaims)
      .set({ releasedAt: sql`CURRENT_TIMESTAMP` })
      .where(
        and(eq(inventoryClaims.assignmentId, assignmentId), isNull(inventoryClaims.releasedAt)),
      );
    await transaction.insert(inventoryClaims).values({
      branchId: scope.branchId,
      roomId: scope.roomId,
      seatId: scope.seatId,
      seatOrdinal: 1,
      assignmentId,
      moveInDate: start,
      moveOutDate: revisedEnd,
    });
    const future = await block(transaction, scope, revisedEnd, shift(today, 3));
    expect(
      await transaction.select().from(inventoryBlocks).where(eq(inventoryBlocks.id, future)),
    ).toHaveLength(1);
    const [actual] = await transaction
      .select()
      .from(stayAssignments)
      .where(eq(stayAssignments.id, assignmentId));
    expect(actual?.endedAt).toBeNull();
    expect(
      await transaction
        .select()
        .from(inventoryBlocks)
        .where(eq(inventoryBlocks.branchId, scope.branchId)),
    ).toHaveLength(1);
  });
});
