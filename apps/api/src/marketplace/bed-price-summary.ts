import { bedDepositSql } from '../inventory/bed-deposit.js';
import { and, eq, isNull, sql, type SQLWrapper } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { rooms, seats } from '@hsm/db';
import type { ListingReader } from './listing-query.js';
import { bedRentSql } from '../inventory/bed-price.js';
import { publishedBedPhoto, publishedRoomPhoto } from './selectable-media.js';
// Public type rent is a "from" amount across its actually selectable physical beds.
export function minimumPublicBedRent(
  database: ListingReader,
  branch: SQLWrapper,
  typeId: SQLWrapper,
  fallback: SQLWrapper,
  now: Date,
  security = false,
) {
  const room = alias(rooms, 'bed_price_summary_room'),
    bed = alias(seats, 'bed_price_summary_bed');
  const amount = security
    ? bedDepositSql(database, branch, bed.id, fallback, now)
    : bedRentSql(database, branch, bed.id, fallback, now);
  const selected = database
    .select({ amount: sql<bigint | null>`min(${amount})` })
    .from(bed)
    .innerJoin(room, and(eq(room.id, bed.roomId), eq(room.branchId, bed.branchId)))
    .where(
      and(
        eq(bed.branchId, branch),
        eq(room.roomTypeId, typeId),
        isNull(bed.archivedAt),
        isNull(room.archivedAt),
        eq(bed.status, 'active'),
        eq(room.status, 'active'),
        publishedBedPhoto(database, branch, room.id, bed.id),
        publishedRoomPhoto(database, branch, room.id),
      ),
    );
  return sql<bigint | null>`coalesce((${selected}), ${fallback})`.mapWith({
    mapFromDriverValue: (value: unknown): bigint | null =>
      value === null ? null : BigInt(String(value)),
  });
}

export function minimumPublicBedDeposit(
  database: ListingReader,
  branch: SQLWrapper,
  typeId: SQLWrapper,
  fallback: SQLWrapper,
  now: Date,
) {
  return minimumPublicBedRent(database, branch, typeId, fallback, now, true).mapWith(
    (value: unknown) => BigInt(String(value)),
  );
}
