import { and, count, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { branches, brands, organizations, cities, places } from '@hsm/db';
import type { Transaction } from '../audit/writer.js';
import { publicListingCondition } from './query.js';
export async function publicInstitutionCounts(
  database: Transaction,
  ids: string[],
  radiusMeters: number,
) {
  if (!ids.length) return new Map<string, number>();
  const rows = await database
    .select({ placeId: places.id, hostelCount: count() })
    .from(branches)
    .innerJoin(brands, eq(brands.id, branches.brandId))
    .innerJoin(organizations, eq(organizations.id, branches.organizationId))
    .innerJoin(cities, eq(cities.id, branches.cityId))
    .innerJoin(
      places,
      and(
        inArray(places.id, ids),
        sql`ST_DWithin(${branches.location}, ${places.location}, ${radiusMeters})`,
      ),
    )
    .where(
      and(publicListingCondition(), eq(places.isActive, true), isNotNull(places.publicApprovedAt)),
    )
    .groupBy(places.id);
  return new Map(rows.map((row) => [row.placeId, row.hostelCount]));
}
