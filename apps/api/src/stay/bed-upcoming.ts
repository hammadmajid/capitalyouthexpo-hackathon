import { and, asc, eq, gt, isNull, or } from 'drizzle-orm';
import { inventoryClaims, stayAssignments } from '@hsm/db';
import type { Transaction } from '../audit/writer.js';
// BED-002: live claims on this bed (or its whole room) that start after the date, earliest
// first. Called only inside the bed read, after the stay_manage scope lock. An expired hold
// no longer reserves anything, matching the covering-claim rule.
export async function readUpcomingClaims(
  tx: Transaction,
  branchId: string,
  roomId: string,
  bedId: string,
  on: string,
  now: Date,
) {
  const rows = await tx
    .select({
      seatId: inventoryClaims.seatId,
      assignmentId: inventoryClaims.assignmentId,
      blockId: inventoryClaims.blockId,
      bookingId: inventoryClaims.bookingId,
      moveInDate: inventoryClaims.moveInDate,
      moveOutDate: inventoryClaims.moveOutDate,
      stayId: stayAssignments.stayId,
    })
    .from(inventoryClaims)
    .leftJoin(
      stayAssignments,
      and(
        eq(stayAssignments.id, inventoryClaims.assignmentId),
        eq(stayAssignments.branchId, inventoryClaims.branchId),
      ),
    )
    .where(
      and(
        eq(inventoryClaims.branchId, branchId),
        eq(inventoryClaims.roomId, roomId),
        or(eq(inventoryClaims.seatId, bedId), isNull(inventoryClaims.seatId)),
        isNull(inventoryClaims.releasedAt),
        gt(inventoryClaims.moveInDate, on),
        or(isNull(inventoryClaims.holdId), gt(inventoryClaims.expiresAt, now)),
      ),
    )
    .orderBy(asc(inventoryClaims.moveInDate), asc(inventoryClaims.id))
    .limit(20);
  return rows.map((row) => ({
    source:
      row.assignmentId !== null
        ? ('assignment' as const)
        : row.blockId !== null
          ? ('block' as const)
          : row.bookingId !== null
            ? ('booking' as const)
            : ('hold' as const),
    bookingId: row.bookingId,
    stayId: row.assignmentId !== null ? row.stayId : null,
    moveInDate: row.moveInDate,
    moveOutDate: row.moveOutDate,
    wholeRoom: row.seatId === null,
  }));
}
