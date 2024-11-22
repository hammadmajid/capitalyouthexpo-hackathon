import { bedDepositSql } from '../inventory/bed-deposit.js';
import { roomCapacity } from '../inventory/room-capacity.js';
import { bedRentSql } from '../inventory/bed-price.js';
import { claimCoversStart } from '../booking/claim-overlap.js';
import {
  and,
  eq,
  exists,
  gt,
  inArray,
  ilike,
  isNull,
  isNotNull,
  lt,
  notExists,
  or,
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  brands,
  branches,
  organizations,
  areas,
  cities,
  places,
  placeAliases,
  branchAmenities,
  amenities,
  currentRoomTypes as roomTypes,
  rooms,
  seats,
  inventoryClaims,
} from '@hsm/db';
import type { Transaction } from '../audit/writer.js';
import type { MarketplaceQuery } from '@hsm/contracts';
import { publishedBedPhoto, publishedRoomPhoto } from './selectable-media.js';
import { matchingPublicOption } from './discovery-inventory.js';
import { optionFiltersRequested, optionTypeCondition } from './option-filter.js';
const availableRoom = alias(rooms, 'available_room'),
  availableType = alias(roomTypes, 'available_type');
const availableSeat = alias(seats, 'available_seat'),
  claim = alias(inventoryClaims, 'available_claim');
export function publicListingCondition() {
  return and(
    eq(branches.verificationStatus, 'approved'),
    isNull(branches.listingHiddenAt),
    isNull(branches.archivedAt),
    isNull(brands.archivedAt),
    isNull(organizations.archivedAt),
    eq(cities.isActive, true),
  );
}
function availabilityCondition(
  database: Pick<Transaction, 'select'>,
  query: MarketplaceQuery,
  now: Date,
) {
  if (!query.availableOnly || !query.moveInDate || !query.moveOutDate) return undefined;
  const liveClaim = and(
    eq(claim.roomId, availableRoom.id),
    isNull(claim.releasedAt),
    or(isNull(claim.expiresAt), gt(claim.expiresAt, now)),
    lt(claim.moveInDate, query.moveOutDate),
    claimCoversStart(claim, query.moveInDate, now),
  );
  const bedConflict = database
    .select({ id: claim.id })
    .from(claim)
    .where(and(liveClaim, or(isNull(claim.seatId), eq(claim.seatId, availableSeat.id))));
  const wholeConflict = database.select({ id: claim.id }).from(claim).where(liveClaim);
  const roomUnavailable = database
    .select({ id: availableSeat.id })
    .from(availableSeat)
    .where(
      and(
        eq(availableSeat.roomId, availableRoom.id),
        isNull(availableSeat.archivedAt),
        or(eq(availableSeat.status, 'maintenance'), eq(availableSeat.status, 'inactive')),
      ),
    );
  const bed = database
    .select({ id: availableSeat.id })
    .from(availableSeat)
    .where(
      and(
        eq(availableSeat.roomId, availableRoom.id),
        eq(availableSeat.status, 'active'),
        isNull(availableSeat.archivedAt),
        publishedBedPhoto(database, availableRoom.branchId, availableRoom.id, availableSeat.id),
        notExists(bedConflict),
        optionTypeCondition(
          availableType,
          query,
          'bed',
          bedRentSql(
            database,
            availableRoom.branchId,
            availableSeat.id,
            availableType.bedMonthlyRentPaisa,
            now,
          ),
          roomCapacity(database, availableRoom.branchId, availableRoom.id),
          bedDepositSql(
            database,
            availableRoom.branchId,
            availableSeat.id,
            availableType.depositPaisa,
            now,
          ),
        ),
      ),
    );
  return exists(
    database
      .select({ id: availableRoom.id })
      .from(availableRoom)
      .innerJoin(
        availableType,
        and(
          eq(availableType.id, availableRoom.roomTypeId),
          eq(availableType.branchId, availableRoom.branchId),
        ),
      )
      .where(
        and(
          eq(availableRoom.branchId, branches.id),
          eq(availableRoom.status, 'active'),
          gt(roomCapacity(database, availableRoom.branchId, availableRoom.id), 0),
          isNull(availableRoom.archivedAt),
          isNull(availableType.archivedAt),
          // ROOM-003: Available Now counts only publicly selectable inventory.
          publishedRoomPhoto(database, availableRoom.branchId, availableRoom.id),
          or(
            exists(bed),
            and(
              optionTypeCondition(
                availableType,
                query,
                'room',
                undefined,
                roomCapacity(database, availableRoom.branchId, availableRoom.id),
              ),
              notExists(roomUnavailable),
              notExists(wholeConflict),
            ),
          ),
        ),
      ),
  );
}
export const anchorPoint = (latitude: number, longitude: number) =>
  sql`ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography`;
export function marketplaceCondition(
  database: Pick<Transaction, 'select'>,
  query: MarketplaceQuery,
  now: Date,
  textRadiusMeters: number,
) {
  const text = query.q
    ? '%' + query.q.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_') + '%'
    : undefined;
  const nearbyText = text
    ? exists(
        database
          .select({ id: places.id })
          .from(places)
          .where(
            and(
              eq(places.isActive, true),
              isNotNull(places.publicApprovedAt),
              or(
                ilike(places.name, text),
                ilike(places.shortName, text),
                exists(
                  database
                    .select({ id: placeAliases.placeId })
                    .from(placeAliases)
                    .where(
                      and(eq(placeAliases.placeId, places.id), ilike(placeAliases.alias, text)),
                    ),
                ),
              ),
              sql`ST_DWithin(${branches.location}, ${places.location}, ${textRadiusMeters})`,
            ),
          ),
      )
    : undefined;
  // CHG-034: a phone location or map pin anchors the radius directly.
  const pointNear =
    query.nearLatitude !== undefined && query.nearLongitude !== undefined
      ? sql`ST_DWithin(${branches.location}, ${anchorPoint(query.nearLatitude, query.nearLongitude)}, ${query.radiusMeters})`
      : undefined;
  const near = pointNear
    ? pointNear
    : query.universityPlaceId
      ? exists(
          database
            .select({ id: places.id })
            .from(places)
            .where(
              and(
                // CHG-033: any approved place (campus, hospital, office, G-10, ...) can anchor search.
                eq(places.id, query.universityPlaceId),
                eq(places.isActive, true),
                isNotNull(places.publicApprovedAt),
                sql`ST_DWithin(${branches.location}, ${places.location}, ${query.radiusMeters})`,
              ),
            ),
        )
      : undefined;
  const amenityConditions = (query.amenities ?? []).map((code) =>
    exists(
      database
        .select({ id: branchAmenities.branchId })
        .from(branchAmenities)
        .innerJoin(amenities, eq(amenities.code, branchAmenities.amenityCode))
        .where(
          and(
            eq(branchAmenities.branchId, branches.id),
            eq(branchAmenities.amenityCode, code),
            eq(amenities.isActive, true),
          ),
        ),
    ),
  );
  // p.13: rent, deposit, seater and option-kind filters must match one option together.
  const price = optionFiltersRequested(query)
    ? matchingPublicOption(database, branches.id, query, now)
    : undefined;
  return and(
    publicListingCondition(),
    query.ids ? inArray(branches.id, query.ids) : undefined,
    query.cursor && !query.sort ? gt(branches.id, query.cursor) : undefined,
    query.cityId ? eq(branches.cityId, query.cityId) : undefined,
    query.areaId ? eq(branches.areaId, query.areaId) : undefined,
    query.category ? eq(branches.category, query.category) : undefined,
    text
      ? or(
          ilike(branches.name, text),
          ilike(brands.name, text),
          ilike(areas.name, text),
          ilike(cities.name, text),
          nearbyText,
        )
      : undefined,
    near,
    ...amenityConditions,
    price,
    availabilityCondition(database, query, now),
    query.west !== undefined
      ? sql`ST_Intersects(${branches.location}::geometry,
      ST_MakeEnvelope(${query.west}, ${query.south}, ${query.east}, ${query.north}, 4326))`
      : undefined,
  );
}
