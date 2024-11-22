import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { roomTypes, stayAssignments, stayHistory, stays } from '@hsm/db';
import type { Transaction } from '../audit/writer.js';
// CHG-040 / WAIT-001: a waiting list only opens when a current resident has given departure
// notice, and the expected vacancy date is that notice's requested checkout date. A full room
// with no notice has no bed to wait for. Returns the earliest such date, or null.
export async function noticeVacancyDate(
  tx: Transaction,
  branchId: string,
  roomTypeId?: string | null,
) {
  const rows = await tx
    .select({
      stayId: stays.id,
      createdAt: stayHistory.createdAt,
      requested: sql<string | null>`${stayHistory.detail}->>'requestedCheckoutDate'`,
    })
    .from(stays)
    .innerJoin(
      stayAssignments,
      and(
        eq(stayAssignments.branchId, stays.branchId),
        eq(stayAssignments.stayId, stays.id),
        isNull(stayAssignments.endedAt),
        roomTypeId ? eq(stayAssignments.roomTypeId, roomTypeId) : undefined,
      ),
    )
    .innerJoin(
      stayHistory,
      and(
        eq(stayHistory.branchId, stays.branchId),
        eq(stayHistory.stayId, stays.id),
        eq(stayHistory.reasonCode, 'notice_submitted'),
      ),
    )
    .where(
      and(eq(stays.branchId, branchId), inArray(stays.state, ['notice_given', 'checkout_pending'])),
    );
  // A resident may resubmit notice; only their latest notice counts.
  const latest = new Map<string, { at: number; date: string | null }>();
  for (const row of rows) {
    const seen = latest.get(row.stayId);
    if (!seen || row.createdAt.getTime() > seen.at)
      latest.set(row.stayId, { at: row.createdAt.getTime(), date: row.requested });
  }
  const dates = [...latest.values()]
    .map((value) => value.date)
    .filter(
      (value): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value),
    )
    .sort();
  return dates[0] ?? null;
}
// CHG-040: which of a branch's room types a customer may wait for right now. Only ids are
// returned: never who gave notice, when they leave, or any rent state (BR-05).
export async function noticeRoomTypeIds(tx: Transaction, branchId: string) {
  const types = await tx
    .select({ id: roomTypes.id })
    .from(roomTypes)
    .where(and(eq(roomTypes.branchId, branchId), isNull(roomTypes.archivedAt)));
  const open = await Promise.all(
    types.map(async (type) => ((await noticeVacancyDate(tx, branchId, type.id)) ? type.id : null)),
  );
  return open.filter((id): id is string => id !== null);
}
