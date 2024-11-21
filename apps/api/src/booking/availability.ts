import { claimCoversStart } from './claim-overlap.js';
import { and, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import { inventoryClaims } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
import type { QuoteInput } from '@hsm/contracts';
export async function inventoryAvailable(
  database: Transaction,
  input: QuoteInput,
  now: Date,
  ignoreHoldId?: string,
  ignoreBookingId?: string,
) {
  const conflicts = await database
    .select({ id: inventoryClaims.id })
    .from(inventoryClaims)
    .where(
      and(
        eq(inventoryClaims.roomId, input.target.roomId),
        isNull(inventoryClaims.releasedAt),
        lt(inventoryClaims.moveInDate, input.range.moveOutDate),
        claimCoversStart(inventoryClaims, input.range.moveInDate, now),
        or(isNull(inventoryClaims.expiresAt), gt(inventoryClaims.expiresAt, now)),
        input.target.kind === 'bed'
          ? or(isNull(inventoryClaims.seatId), eq(inventoryClaims.seatId, input.target.bedId))
          : undefined,
        ignoreHoldId
          ? sql`(${inventoryClaims.holdId} is null or ${inventoryClaims.holdId} <> ${ignoreHoldId})`
          : undefined,
        ignoreBookingId
          ? sql`(${inventoryClaims.bookingId} is null or ${inventoryClaims.bookingId} <> ${ignoreBookingId})`
          : undefined,
      ),
    )
    .limit(1);
  return conflicts.length === 0;
}
export async function requireInventoryAvailable(
  database: Transaction,
  input: QuoteInput,
  now: Date,
  ignoreHoldId?: string,
  ignoreBookingId?: string,
) {
  if (!(await inventoryAvailable(database, input, now, ignoreHoldId, ignoreBookingId)))
    throw new DomainError('CONFLICT', 409, 'Availability changed; choose another room or bed');
}
