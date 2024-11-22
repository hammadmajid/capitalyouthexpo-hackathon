import { and, eq, gt } from 'drizzle-orm';
import { branches, users, visitHistory, visitRequests } from '@hsm/db';
import { DomainError, visitHistoryPageSchema } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
// Caller holds the authorized visit lock; no private identifiers enter the DTO.
export async function readVisitHistory(
  tx: Transaction,
  visit: typeof visitRequests.$inferSelect,
  query: { limit: number; cursor?: string | undefined },
) {
  const [names] = await tx
    .select({ branchName: branches.name, customerName: users.fullName })
    .from(branches)
    .innerJoin(users, eq(users.id, visit.customerUserId))
    .where(eq(branches.id, visit.branchId))
    .limit(1);
  if (!names) throw new DomainError('NOT_FOUND', 404, 'Visit unavailable');
  const rows = await tx
    .select()
    .from(visitHistory)
    .where(
      and(
        eq(visitHistory.branchId, visit.branchId),
        eq(visitHistory.visitId, visit.id),
        query.cursor ? gt(visitHistory.id, query.cursor) : undefined,
      ),
    )
    .orderBy(visitHistory.id)
    .limit(query.limit + 1);
  const selected = rows.slice(0, query.limit);
  return visitHistoryPageSchema.parse({
    visitId: visit.id,
    branchId: visit.branchId,
    ...names,
    data: selected.map((row) => ({
      id: row.id,
      action: row.action,
      status: row.status,
      requestedStart: row.requestedStart.toISOString(),
      proposedStart: row.proposedStart?.toISOString() ?? null,
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
    })),
    nextCursor: rows.length > query.limit ? selected.at(-1)?.id : null,
  });
}
