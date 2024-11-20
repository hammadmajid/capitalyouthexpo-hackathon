import {
  and,
  eq,
  gt,
  isNotNull,
  isNull,
  lt,
  lte,
  notExists,
  or,
  sql,
  type SQLWrapper,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DomainError } from '@hsm/contracts';
import type { Database } from './index.js';
import { inventoryClaims, rooms, seats } from './schema/index.js';
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type ListingReader = Pick<Transaction, 'select'>;
type MarketplaceQuery = { moveInDate?: string | undefined; moveOutDate?: string | undefined };
const room = alias(rooms, 'summary_room'),
  bed = alias(seats, 'summary_bed'),
  claim = alias(inventoryClaims, 'summary_claim');
function inventoryToday(now: Date) {
  if (!Number.isFinite(now.getTime()))
    throw new DomainError('VALIDATION_FAILED', 422, 'Invalid clock');
  return new Date(now.getTime() + 5 * 3600000).toISOString().slice(0, 10);
}
// RES-004 / ACC-001: planned departure never checks out an actual current occupant.
export function bookingClaimCoversStart(
  claim: { moveOutDate: SQLWrapper; assignmentId: SQLWrapper },
  start: string,
  now: Date,
) {
  const today = inventoryToday(now);
  return or(
    isNull(claim.moveOutDate),
    gt(claim.moveOutDate, start),
    and(
      isNotNull(claim.assignmentId),
      or(sql`${start} <= ${today}`, lte(claim.moveOutDate, today)),
    ),
  );
}

export function inventoryOptionAvailability(
  database: ListingReader,
  branch: SQLWrapper,
  input: Pick<MarketplaceQuery, 'moveInDate' | 'moveOutDate'>,
  now: Date,
  perBed: boolean,
  selectedRoom: SQLWrapper = room.id,
  selectedBed: SQLWrapper = bed.id,
) {
  if (!input.moveInDate || !input.moveOutDate) return sql<boolean | null>`null`;
  const conflict = database
    .select({ id: claim.id })
    .from(claim)
    .where(
      and(
        eq(claim.branchId, branch),
        eq(claim.roomId, selectedRoom),
        isNull(claim.releasedAt),
        or(isNull(claim.expiresAt), gt(claim.expiresAt, now)),
        lt(claim.moveInDate, input.moveOutDate),
        bookingClaimCoversStart(claim, input.moveInDate, now),
        perBed ? or(isNull(claim.seatId), eq(claim.seatId, selectedBed)) : undefined,
      ),
    );
  return sql<boolean | null>`${notExists(conflict)}`;
}
export function inventoryWholeRoomOperational(
  database: ListingReader,
  branch: SQLWrapper,
  selectedRoom: SQLWrapper,
) {
  const inactive = database
    .select({ id: bed.id })
    .from(bed)
    .where(
      and(
        eq(bed.roomId, selectedRoom),
        eq(bed.branchId, branch),
        isNull(bed.archivedAt),
        or(eq(bed.status, 'inactive'), eq(bed.status, 'maintenance')),
      ),
    );
  return notExists(inactive);
}
