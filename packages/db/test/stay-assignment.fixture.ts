import { eq } from 'drizzle-orm';
import { inventoryClaims, stays, stayAssignments, type Database } from '../src/index.js';
export type AssignmentFixture = typeof stayAssignments.$inferInsert & { id: string };
export function assignmentDate(value: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}
export async function insertAssignment(database: Database, row: AssignmentFixture) {
  return database.transaction(async (transaction) => {
    const [stay] = await transaction.select().from(stays).where(eq(stays.id, row.stayId));
    if (!stay) throw new Error('Stay fixture missing');
    await transaction.insert(stayAssignments).values(row);
    if (!row.endedAt)
      await transaction.insert(inventoryClaims).values({
        branchId: row.branchId,
        roomId: row.roomId,
        seatId: row.seatId ?? null,
        seatOrdinal: row.seatOrdinal ?? null,
        assignmentId: row.id,
        moveInDate: assignmentDate(row.startedAt),
        moveOutDate: stay.expectedLeaveDate,
      });
  });
}
export async function closeAssignment(database: Database, id: string, endedAt: Date) {
  return database.transaction(async (transaction) => {
    await transaction.update(stayAssignments).set({ endedAt }).where(eq(stayAssignments.id, id));
    await transaction
      .update(inventoryClaims)
      .set({ releasedAt: endedAt })
      .where(eq(inventoryClaims.assignmentId, id));
  });
}
