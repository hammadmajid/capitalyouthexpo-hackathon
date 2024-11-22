import { and, eq, sql, type SQLWrapper } from 'drizzle-orm';
import { amenities, branchAmenities, files, listingMedia } from '@hsm/db';
import type { MarketplaceQuery } from '@hsm/contracts';
import { publicPhotoEligibility } from './gallery-query.js';
import { discoveryInventory } from './discovery-inventory.js';
import { publicListingPage, type ListingReader } from './listing-query.js';
import { sortedListingPage } from './sorted-listing.js';
type Page = { branchId: SQLWrapper };
function selectedAmenities(database: ListingReader, page: Page) {
  // Existing listing configuration accepts at most 100 selected codes. The extra
  // row makes corrupted oversized metadata fail validation instead of truncating.
  const rows = database
    .select({ code: amenities.code, name: amenities.name })
    .from(branchAmenities)
    .innerJoin(amenities, eq(amenities.code, branchAmenities.amenityCode))
    .where(and(eq(branchAmenities.branchId, page.branchId), eq(amenities.isActive, true)))
    .orderBy(amenities.code)
    .limit(101)
    .as('discovery_amenity_rows');
  return database
    .select({
      value:
        sql<unknown>`coalesce(jsonb_agg(jsonb_build_object('code', ${rows.code}, 'name', ${rows.name}) order by ${rows.code}), '[]'::jsonb)`.as(
          'selected_amenities',
        ),
    })
    .from(rows)
    .as('discovery_amenities');
}
function selectedCover(database: ListingReader, page: Page, bucket: string) {
  return database
    .select({ id: listingMedia.id, altText: listingMedia.altText })
    .from(listingMedia)
    .innerJoin(files, eq(files.id, listingMedia.fileId))
    .where(publicPhotoEligibility(page.branchId, bucket))
    .orderBy(listingMedia.sortOrder, listingMedia.id)
    .limit(1)
    .as('discovery_cover');
}
// One SQL snapshot: public parent paging, inventory aggregates, approved amenities,
// and one currently eligible cover. No physical inventory arrays are selected.
export function publicDiscoveryQuery(
  database: ListingReader,
  input: MarketplaceQuery,
  now: Date,
  radius: number,
  bucket: string,
) {
  const sort = input.sort;
  const sorted = sort ? sortedListingPage(database, { ...input, sort }, now, radius) : undefined;
  const page = sorted ?? publicListingPage(database, input, now, radius);
  const inventory = discoveryInventory(database, page.branchId, input, now);
  const selected = selectedAmenities(database, page),
    cover = selectedCover(database, page, bucket);
  return database
    .select({
      branchId: page.branchId,
      brandName: page.brandName,
      name: page.name,
      slug: page.slug,
      category: page.category,
      city: page.city,
      area: page.area,
      latitude: page.latitude,
      longitude: page.longitude,
      distanceMeters: page.distanceMeters,
      priceFromPaisa: inventory.priceFromPaisa,
      availableBeds: inventory.availableBeds,
      availableWholeRooms: inventory.availableWholeRooms,
      amenities: selected.value,
      media: sql<unknown>`case when ${cover.id} is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('id', ${cover.id}, 'altText', ${cover.altText})) end`,
      sortKeys: sorted
        ? sql<
            string[]
          >`array[${sorted.sortKey0}::text, ${sorted.sortKey1}::text, ${sorted.sortKey2}::text]`
        : sql<null>`null`,
    })
    .from(page)
    .leftJoinLateral(inventory, sql`true`)
    .leftJoinLateral(selected, sql`true`)
    .leftJoinLateral(cover, sql`true`)
    .orderBy(...(sorted ? [sorted.sortKey0, sorted.sortKey1, sorted.sortKey2] : []), page.branchId)
    .limit(input.limit + 1);
}
export async function readPublicDiscoveryRows(
  database: ListingReader,
  input: MarketplaceQuery,
  now: Date,
  radius: number,
  bucket: string,
) {
  return await publicDiscoveryQuery(database, input, now, radius, bucket);
}
