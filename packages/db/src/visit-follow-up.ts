import { and, desc, eq, isNull, notExists, sql } from 'drizzle-orm';
import { DomainError } from '@hsm/contracts';
import type { Database } from './index.js';
import { lockInventoryBranch } from './inventory-lock.js';
import { visitHistory, visitRequests } from './schema/visits.js';
import { visitInterestResponses } from './schema/visit-interest.js';
import { enqueueVisitLifecycle } from './visit-lifecycle.js';
// VISIT-001 / NTF-002: marker and recipient-free event commit together, once per visit.
export async function sweepVisitFollowUps(db: Database, now: Date) {
  const eligible = and(
    eq(visitRequests.status, 'completed'),
    isNull(visitRequests.followUpSentAt),
    notExists(
      db
        .select({ one: sql`1` })
        .from(visitInterestResponses)
        .where(
          and(
            eq(visitInterestResponses.visitId, visitRequests.id),
            eq(visitInterestResponses.branchId, visitRequests.branchId),
          ),
        ),
    ),
  );
  const candidates = await db
    .select({ id: visitRequests.id, branchId: visitRequests.branchId })
    .from(visitRequests)
    .where(eligible)
    .orderBy(visitRequests.id)
    .limit(100);
  let published = 0;
  for (const candidate of candidates)
    published += await db.transaction(async (tx) => {
      await lockInventoryBranch(tx, candidate.branchId);
      const [visit] = await tx
        .select()
        .from(visitRequests)
        .where(
          and(
            eq(visitRequests.id, candidate.id),
            eq(visitRequests.branchId, candidate.branchId),
            eq(visitRequests.status, 'completed'),
            isNull(visitRequests.followUpSentAt),
          ),
        )
        .for('update');
      if (!visit) return 0;
      const [answered] = await tx
        .select({ id: visitInterestResponses.id })
        .from(visitInterestResponses)
        .where(
          and(
            eq(visitInterestResponses.branchId, visit.branchId),
            eq(visitInterestResponses.visitId, visit.id),
          ),
        )
        .limit(1);
      if (answered) return 0;
      const [history] = await tx
        .select({ id: visitHistory.id })
        .from(visitHistory)
        .where(
          and(
            eq(visitHistory.branchId, visit.branchId),
            eq(visitHistory.visitId, visit.id),
            eq(visitHistory.action, 'complete'),
            eq(visitHistory.status, 'completed'),
          ),
        )
        .orderBy(desc(visitHistory.id))
        .limit(1);
      if (!history)
        throw new DomainError('PRECONDITION_FAILED', 412, 'Completed visit history unavailable');
      await enqueueVisitLifecycle(
        tx,
        { event: 'visit.follow_up', visitId: visit.id, historyId: history.id },
        now,
      );
      await tx
        .update(visitRequests)
        .set({ followUpSentAt: now })
        .where(eq(visitRequests.id, visit.id));
      return 1;
    });
  return published;
}
