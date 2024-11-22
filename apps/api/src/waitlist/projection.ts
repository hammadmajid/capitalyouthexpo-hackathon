import { and, eq, gt } from 'drizzle-orm';
import { branches, roomTypes, users, waitlistEntries } from '@hsm/db';
import { noticeVacancyDate } from './notice-vacancy.js';
import {
  DomainError,
  staffWaitlistPageSchema,
  waitlistEntrySchema,
  waitlistPageSchema,
  type WaitlistQuery,
} from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';

const fields = {
  id: waitlistEntries.id,
  branchId: waitlistEntries.branchId,
  branchName: branches.name,
  roomTypeId: waitlistEntries.roomTypeId,
  roomTypeName: roomTypes.name,
  joinedAt: waitlistEntries.joinedAt,
  leftAt: waitlistEntries.leftAt,
};
function selection(tx: Transaction) {
  return tx
    .select({ ...fields, customerName: users.fullName })
    .from(waitlistEntries)
    .innerJoin(branches, eq(branches.id, waitlistEntries.branchId))
    .innerJoin(users, eq(users.id, waitlistEntries.customerUserId))
    .leftJoin(
      roomTypes,
      and(
        eq(roomTypes.id, waitlistEntries.roomTypeId),
        eq(roomTypes.branchId, waitlistEntries.branchId),
      ),
    );
}
function project(
  row: Awaited<ReturnType<typeof selection>>[number],
  expectedVacancyDate: string | null,
) {
  return {
    id: row.id,
    branchId: row.branchId,
    branchName: row.branchName,
    roomTypeId: row.roomTypeId,
    roomTypeName: row.roomTypeName,
    expectedVacancyDate,
    joinedAt: row.joinedAt.toISOString(),
    leftAt: row.leftAt?.toISOString() ?? null,
  };
}
export async function readWaitlistEntry(tx: Transaction, entryId: string) {
  const [row] = await selection(tx).where(eq(waitlistEntries.id, entryId));
  if (!row) throw new DomainError('NOT_FOUND', 404, 'Waiting-list entry unavailable');
  return waitlistEntrySchema.parse(
    project(row, await noticeVacancyDate(tx, row.branchId, row.roomTypeId)),
  );
}
export async function readWaitlistPage(
  tx: Transaction,
  scope: { branchId: string } | { customerUserId: string },
  query: WaitlistQuery,
) {
  const rows = await selection(tx)
    .where(
      and(
        'branchId' in scope
          ? eq(waitlistEntries.branchId, scope.branchId)
          : eq(waitlistEntries.customerUserId, scope.customerUserId),
        query.cursor ? gt(waitlistEntries.id, query.cursor) : undefined,
        query.roomTypeId ? eq(waitlistEntries.roomTypeId, query.roomTypeId) : undefined,
      ),
    )
    .orderBy(waitlistEntries.id)
    .limit(query.limit + 1);
  const selected = rows.slice(0, query.limit);
  // CHG-040: each entry shows the earliest notice date for its room; one lookup per room per page.
  const dates = new Map<string, Promise<string | null>>();
  const dateFor = (row: (typeof selected)[number]) => {
    const key = row.branchId + ':' + (row.roomTypeId ?? '');
    if (!dates.has(key)) dates.set(key, noticeVacancyDate(tx, row.branchId, row.roomTypeId));
    return dates.get(key) ?? Promise.resolve(null);
  };
  const data = [];
  for (const row of selected) {
    const entry = project(row, await dateFor(row));
    data.push('branchId' in scope ? { ...entry, customerName: row.customerName } : entry);
  }
  const result = { data, nextCursor: rows.length > query.limit ? selected.at(-1)?.id : null };
  return ('branchId' in scope ? staffWaitlistPageSchema : waitlistPageSchema).parse(result);
}
