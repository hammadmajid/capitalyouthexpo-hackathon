import { sql, type SQL } from 'drizzle-orm';
import {
  decodeMarketplaceSortCursor,
  type MarketplaceQuery,
  type MarketplaceSort,
} from '@hsm/contracts';
import { discoveryInventory } from './discovery-inventory.js';
import { publicListingQuery, type ListingReader } from './listing-query.js';
const absent = 9007199254740992n;
// p.13 organic sorts. Every key ascends so one row comparison continues the keyset;
// descending measures are negated and unknown values sort last.
function sortKeys(
  sort: MarketplaceSort,
  price: SQL,
  available: SQL,
  distance: SQL,
  dated: boolean,
): SQL[] {
  const priceKey = sql`coalesce(${price}, ${absent})`,
    availableKey = dated ? sql`-coalesce(${available}, 0)` : sql`0::bigint`,
    distanceKey = sql`coalesce(round((${distance})::double precision)::bigint, ${absent})`;
  if (sort === 'price_asc') return [priceKey];
  if (sort === 'price_desc') return [sql`-coalesce(${price}, -1)`];
  if (sort === 'nearest') return [distanceKey];
  if (sort === 'most_available') return [availableKey];
  // Recommended: selectable inventory, then real availability, then proximity.
  return [sql`case when ${price} is null then 1 else 0 end`, availableKey, distanceKey];
}
export function sortedListingPage(
  database: ListingReader,
  input: MarketplaceQuery & { sort: MarketplaceSort },
  now: Date,
  radius: number,
) {
  const unpaged = { ...input };
  delete unpaged.cursor;
  const candidates = publicListingQuery(database, unpaged, now, radius).as('sort_candidate');
  const inventory = discoveryInventory(database, candidates.branchId, input, now);
  const dated = input.moveInDate !== undefined && input.moveOutDate !== undefined;
  const keys = sortKeys(
    input.sort,
    sql`(${inventory.priceFromPaisa})::bigint`,
    sql`((${inventory.availableBeds})::bigint + (${inventory.availableWholeRooms})::bigint)`,
    sql`${candidates.distanceMeters}`,
    dated,
  );
  const cursor = input.cursor ? decodeMarketplaceSortCursor(input.cursor) : undefined;
  const ordered = sql.join([...keys, sql`${candidates.branchId}`], sql`, `);
  const after = cursor
    ? sql`(${ordered}) > (${sql.join(
        [...cursor.keys.map((value) => sql`${BigInt(value)}::bigint`), sql`${cursor.id}::uuid`],
        sql`, `,
      )})`
    : sql`true`;
  // Three explicit bigint key columns let the outer page keep the exact order and cursor.
  const padded = [...keys, sql`0::bigint`, sql`0::bigint`].slice(0, 3);
  return database
    .select({
      branchId: candidates.branchId,
      brandName: candidates.brandName,
      name: candidates.name,
      slug: candidates.slug,
      category: candidates.category,
      city: candidates.city,
      area: candidates.area,
      latitude: candidates.latitude,
      longitude: candidates.longitude,
      distanceMeters: candidates.distanceMeters,
      sortKey0: sql<string>`(${padded[0]})::bigint`.as('sort_key_0'),
      sortKey1: sql<string>`(${padded[1]})::bigint`.as('sort_key_1'),
      sortKey2: sql<string>`(${padded[2]})::bigint`.as('sort_key_2'),
    })
    .from(candidates)
    .leftJoinLateral(inventory, sql`true`)
    .where(after)
    .orderBy(...keys, candidates.branchId)
    .limit(input.limit + 1)
    .as('marketplace_page');
}
