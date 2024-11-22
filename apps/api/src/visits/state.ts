import { createHash } from 'node:crypto';
import { and, eq, gt, gte, lt, getTableColumns } from 'drizzle-orm';
import { branches, users, visitRequests, visitingHours } from '@hsm/db';
import {
  DomainError,
  visitPageSchema,
  visitSummarySchema,
  visitingHoursStateSchema,
  type VisitListQuery,
} from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
export function projectVisit(row: typeof visitRequests.$inferSelect) {
  return visitSummarySchema.parse({
    id: row.id,
    branchId: row.branchId,
    status: row.status,
    requestedStart: row.requestedStart.toISOString(),
    proposedStart: row.proposedStart?.toISOString() ?? null,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
function minuteClock(value: string) {
  if (!/^\d{2}:\d{2}:00$/.test(value))
    throw new DomainError('PRECONDITION_FAILED', 412, 'Visiting hours configuration is invalid');
  return value.slice(0, 5);
}
export async function readVisitHours(tx: Transaction, branchId: string) {
  const rows = await tx
    .select()
    .from(visitingHours)
    .where(eq(visitingHours.branchId, branchId))
    .orderBy(visitingHours.dayOfWeek, visitingHours.opensAt, visitingHours.closesAt);
  const windows = rows.map((row) => ({
    dayOfWeek: row.dayOfWeek,
    opensAt: minuteClock(row.opensAt),
    closesAt: minuteClock(row.closesAt),
  }));
  return visitingHoursStateSchema.parse({
    branchId,
    windows,
    version: createHash('sha256').update(JSON.stringify(windows)).digest('hex'),
  });
}
export async function readVisitPage(
  tx: Transaction,
  scope: { branchId: string } | { customerUserId: string },
  query: VisitListQuery,
) {
  const from = query.date ? new Date(query.date + 'T00:00:00+05:00') : undefined;
  const rows = await tx
    .select({
      ...getTableColumns(visitRequests),
      branchName: branches.name,
      customerName: users.fullName,
    })
    .from(visitRequests)
    .innerJoin(branches, eq(branches.id, visitRequests.branchId))
    .innerJoin(users, eq(users.id, visitRequests.customerUserId))
    .where(
      and(
        'branchId' in scope
          ? eq(visitRequests.branchId, scope.branchId)
          : eq(visitRequests.customerUserId, scope.customerUserId),
        query.cursor ? gt(visitRequests.id, query.cursor) : undefined,
        query.status ? eq(visitRequests.status, query.status) : undefined,
        from ? gte(visitRequests.requestedStart, from) : undefined,
        from ? lt(visitRequests.requestedStart, new Date(from.getTime() + 86400000)) : undefined,
      ),
    )
    .orderBy(visitRequests.id)
    .limit(query.limit + 1);
  const selected = rows.slice(0, query.limit);
  return visitPageSchema.parse({
    data: selected.map((row) => ({
      ...projectVisit(row),
      branchName: row.branchName,
      customerName: row.customerName,
    })),
    nextCursor: rows.length > query.limit ? selected.at(-1)?.id : null,
  });
}
