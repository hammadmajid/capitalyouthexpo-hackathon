import { and, gt, isNotNull, isNull, lte, or, sql, type SQLWrapper } from 'drizzle-orm';
import { pakistanToday } from './policy.js';
// RES-004 / ACC-001: planned departure never checks out an actual current occupant.
export function claimCoversStart(
  claim: { moveOutDate: SQLWrapper; assignmentId: SQLWrapper },
  start: string,
  now: Date,
) {
  const today = pakistanToday(now);
  return or(
    isNull(claim.moveOutDate),
    gt(claim.moveOutDate, start),
    and(
      isNotNull(claim.assignmentId),
      or(sql`${start} <= ${today}`, lte(claim.moveOutDate, today)),
    ),
  );
}
