import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import type { Database } from './index.js';
import { waitlistEntries } from './schema/waitlist.js';
import { waitlistAvailability } from './schema/waitlist-events.js';
import { lockInventoryBranch } from './inventory-lock.js';
import { reconcileWaitlistAvailability } from './waitlist-availability.js';
// WAIT-001: bounded oldest-observation-first backstop covers date rollover and current-publicity changes.
export async function sweepWaitlistAvailability(db: Database, now: Date) {
  const candidates = await db
    .selectDistinct({
      branchId: waitlistEntries.branchId,
      roomTypeId: waitlistEntries.roomTypeId,
      checkedAt: waitlistAvailability.checkedAt,
    })
    .from(waitlistEntries)
    .leftJoin(
      waitlistAvailability,
      and(
        eq(waitlistAvailability.branchId, waitlistEntries.branchId),
        sql`${waitlistAvailability.roomTypeId} is not distinct from ${waitlistEntries.roomTypeId}`,
      ),
    )
    .where(
      and(
        isNull(waitlistEntries.leftAt),
        or(
          isNull(waitlistAvailability.checkedAt),
          lte(waitlistAvailability.checkedAt, new Date(now.getTime() - 60000)),
        ),
      ),
    )
    .orderBy(
      sql`${waitlistAvailability.checkedAt} asc nulls first`,
      waitlistEntries.branchId,
      waitlistEntries.roomTypeId,
    )
    .limit(100);
  for (const candidate of candidates)
    await db.transaction(async (tx) => {
      await lockInventoryBranch(tx, candidate.branchId);
      await reconcileWaitlistAvailability(
        tx,
        candidate.branchId,
        now,
        candidate.roomTypeId ?? undefined,
      );
    });
  return candidates.length;
}
