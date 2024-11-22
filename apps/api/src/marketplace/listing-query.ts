import { and, eq, sql } from 'drizzle-orm';
import { areas, branches, brands, cities, organizations, places } from '@hsm/db';
import type { MarketplaceQuery } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
import { anchorPoint, marketplaceCondition } from './query.js';
export type ListingReader = Pick<Transaction, 'select'>;
export function publicListingQuery(
  database: ListingReader,
  input: MarketplaceQuery,
  now: Date,
  textRadiusMeters: number,
  branchId?: string,
) {
  return database
    .select({
      branchId: branches.id,
      brandName: sql<string>`${brands.name}`.as('brand_name'),
      name: sql<string>`${branches.name}`.as('branch_name'),
      slug: branches.slug,
      category: branches.category,
      city: sql<string>`${cities.name}`.as('city_name'),
      area: sql<string | null>`${areas.name}`.as('area_name'),
      latitude: sql<number>`ST_Y(${branches.location}::geometry)`.as('latitude'),
      longitude: sql<number>`ST_X(${branches.location}::geometry)`.as('longitude'),
      distanceMeters: (input.nearLatitude !== undefined && input.nearLongitude !== undefined
        ? sql<number>`ST_Distance(${branches.location}, ${anchorPoint(input.nearLatitude, input.nearLongitude)})`
        : input.universityPlaceId
          ? sql<number>`(select ST_Distance(${branches.location}, ${places.location}) from ${places}
 where ${places.id} = ${input.universityPlaceId} and ${places.isActive} = true)`
          : sql<null>`null`
      ).as('distance_meters'),
      description: branches.description,
      address: branches.addressLine,
      landmark: branches.nearbyLandmark,
      publicPhone: sql<
        string | null
      >`case when ${branches.showPublicContact} then ${branches.publicPhone} else null end`.as(
        'public_phone',
      ),
      publicEmail: sql<
        string | null
      >`case when ${branches.showPublicContact} then ${branches.publicEmail} else null end`.as(
        'public_email',
      ),
    })
    .from(branches)
    .innerJoin(brands, eq(brands.id, branches.brandId))
    .innerJoin(organizations, eq(organizations.id, branches.organizationId))
    .innerJoin(cities, eq(cities.id, branches.cityId))
    .leftJoin(areas, eq(areas.id, branches.areaId))
    .where(
      and(
        marketplaceCondition(database, input, now, textRadiusMeters),
        branchId ? eq(branches.id, branchId) : undefined,
      ),
    );
}
export function publicListingPage(
  database: ListingReader,
  input: MarketplaceQuery,
  now: Date,
  radius: number,
) {
  return publicListingQuery(database, input, now, radius)
    .orderBy(branches.id)
    .limit(input.limit + 1)
    .as('marketplace_page');
}
