import { bedDepositSql } from '../inventory/bed-deposit.js';
import { roomCapacity } from '../inventory/room-capacity.js';
import { claimCoversStart } from '../booking/claim-overlap.js';
import { and, eq, exists, gt, isNull, lt, notExists, or, sql, type SQLWrapper } from 'drizzle-orm';
import { alias, unionAll } from 'drizzle-orm/pg-core';
import { inventoryClaims, rooms, currentRoomTypes as roomTypes, seats } from '@hsm/db';
import type { MarketplaceQuery } from '@hsm/contracts';
import type { ListingReader } from './listing-query.js';
import { publishedBedPhoto, publishedRoomPhoto } from './selectable-media.js';
import { optionTypeCondition } from './option-filter.js';
import { bedRentSql } from '../inventory/bed-price.js';
const room = alias(rooms, 'summary_room'),
  type = alias(roomTypes, 'summary_type');
const bed = alias(seats, 'summary_bed'),
  claim = alias(inventoryClaims, 'summary_claim');
export function publicOptionAvailability(
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
        claimCoversStart(claim, input.moveInDate, now),
        perBed ? or(isNull(claim.seatId), eq(claim.seatId, selectedBed)) : undefined,
      ),
    );
  return sql<boolean | null>`${notExists(conflict)}`;
}
function roomCondition(database: ListingReader, branch: SQLWrapper) {
  return and(
    // ROOM-003 / SEAT-002: summaries aggregate only publicly selectable options.
    publishedRoomPhoto(database, branch, room.id),
    eq(room.branchId, branch),
    eq(type.branchId, room.branchId),
    eq(room.status, 'active'),
    gt(roomCapacity(database, branch, room.id), 0),
    isNull(room.archivedAt),
    isNull(type.archivedAt),
  );
}
function bedOptions(
  database: ListingReader,
  branch: SQLWrapper,
  input: MarketplaceQuery,
  now: Date,
) {
  const available = publicOptionAvailability(database, branch, input, now, true);
  const rent = bedRentSql(database, branch, bed.id, type.bedMonthlyRentPaisa, now);
  return database
    .select({
      price: rent.as('option_price'),
      kind: sql<string>`'bed'`.as('option_kind'),
      available: available.as('option_available'),
    })
    .from(room)
    .innerJoin(type, eq(type.id, room.roomTypeId))
    .innerJoin(bed, and(eq(bed.roomId, room.id), eq(bed.branchId, room.branchId)))
    .where(
      and(
        roomCondition(database, branch),
        eq(bed.status, 'active'),
        isNull(bed.archivedAt),
        publishedBedPhoto(database, branch, room.id, bed.id),
        optionTypeCondition(
          type,
          input,
          'bed',
          rent,
          roomCapacity(database, branch, room.id),
          bedDepositSql(database, branch, bed.id, type.depositPaisa, now),
        ),
        input.availableOnly ? available : undefined,
      ),
    );
}
export function publicWholeRoomOperational(
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
function wholeOptions(
  database: ListingReader,
  branch: SQLWrapper,
  input: MarketplaceQuery,
  now: Date,
) {
  const available = publicOptionAvailability(database, branch, input, now, false);
  return database
    .select({
      price: type.roomMonthlyRentPaisa,
      kind: sql<string>`'room'`.as('option_kind'),
      available: available.as('option_available'),
    })
    .from(room)
    .innerJoin(type, eq(type.id, room.roomTypeId))
    .where(
      and(
        roomCondition(database, branch),
        publicWholeRoomOperational(database, branch, room.id),
        optionTypeCondition(
          type,
          input,
          'room',
          undefined,
          roomCapacity(database, branch, room.id),
        ),
        input.availableOnly ? available : undefined,
      ),
    );
}
// Aggregate physical options in PostgreSQL; no room, bed or claim arrays cross the wire.
export function discoveryInventory(
  database: ListingReader,
  branch: SQLWrapper,
  input: MarketplaceQuery,
  now: Date,
) {
  const options = unionAll(
    bedOptions(database, branch, input, now),
    wholeOptions(database, branch, input, now),
  ).as('summary_options');
  const dated = input.moveInDate !== undefined && input.moveOutDate !== undefined;
  return database
    .select({
      priceFromPaisa: sql<string | null>`min(${options.price})::text`.as('minimum_price'),
      availableBeds: (dated
        ? sql<string>`count(*) filter (where ${options.kind} = 'bed' and ${options.available})::text`
        : sql<null>`null`
      ).as('available_beds'),
      availableWholeRooms: (dated
        ? sql<string>`count(*) filter (where ${options.kind} = 'room' and ${options.available})::text`
        : sql<null>`null`
      ).as('available_whole_rooms'),
    })
    .from(options)
    .as('discovery_inventory');
}

export function matchingPublicOption(
  database: ListingReader,
  branch: SQLWrapper,
  input: MarketplaceQuery,
  now: Date,
) {
  return exists(
    unionAll(bedOptions(database, branch, input, now), wholeOptions(database, branch, input, now)),
  );
}
