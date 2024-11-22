import { and, eq, isNull, sql, type SQLWrapper } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { seats } from '@hsm/db';
import type { Transaction } from '../audit/writer.js';
const bed = alias(seats, 'capacity_bed');
// Installed, non-archived beds define a room; availability/occupancy do not change its size.
export function roomCapacity(
  database: Pick<Transaction, 'select'>,
  branch: string | SQLWrapper,
  room: string | SQLWrapper,
) {
  const count = database
    .select({ total: sql<number>`count(*)::integer` })
    .from(bed)
    .where(and(eq(bed.branchId, branch), eq(bed.roomId, room), isNull(bed.archivedAt)));
  return sql<number>`(${count})`.mapWith(Number);
}
