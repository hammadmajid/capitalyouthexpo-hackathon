import { projectPublicPage } from './public-page-projection.js';
import { PublicInventoryPages } from './public-inventory-pages.js';
import { publicPhotoEligibility } from './gallery-query.js';
import { readPublicDiscoveryRows } from './discovery-query.js';
import { projectDiscoveryPage, discoveryPage } from './discovery-state.js';
import { publicListingQuery } from './listing-query.js';
import { publicRoomAmenities } from './room-amenities.js';
import { publicInstitutionCounts } from './institution-counts.js';
import { and, eq, exists, gt, ilike, isNotNull, or, sql } from 'drizzle-orm';
import { placeRelevance } from './place-relevance.js';
import {
  cities,
  places,
  placeAliases,
  amenities,
  branchAmenities,
  listingMedia,
  files,
  type Database,
} from '@hsm/db';
import {
  DomainError,
  listingInventoryDetailsSchema,
  listingOverviewSchema,
  institutionPageSchema,
  type MarketplaceQuery,
  type ManagementPage,
} from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
import { publicInventory } from './inventory.js';
export class MarketplaceRepository {
  readonly inventoryPages: PublicInventoryPages;
  constructor(
    readonly database: Database,
    private readonly bucket: string,
    private readonly textRadiusMeters: number,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.inventoryPages = new PublicInventoryPages(database, clock);
  }
  private query(database: Transaction, input: MarketplaceQuery, now: Date, branchId?: string) {
    return publicListingQuery(database, input, now, this.textRadiusMeters, branchId);
  }

  private async supplements(
    database: Transaction,
    branchId: string,
    input: MarketplaceQuery,
    now: Date,
  ) {
    const selectedAmenities = await database
      .select({ code: amenities.code, name: amenities.name })
      .from(branchAmenities)
      .innerJoin(amenities, eq(amenities.code, branchAmenities.amenityCode))
      .where(and(eq(branchAmenities.branchId, branchId), eq(amenities.isActive, true)))
      .orderBy(amenities.code);
    const media = await database
      .select({ id: listingMedia.id, altText: listingMedia.altText })
      .from(listingMedia)
      .innerJoin(files, eq(files.id, listingMedia.fileId))
      .where(publicPhotoEligibility(branchId, this.bucket))
      .orderBy(listingMedia.sortOrder, listingMedia.id)
      .limit(1);
    const inventory = await publicInventory(database, branchId, input, now);
    return { ...inventory, amenities: selectedAmenities, media, verified: true as const };
  }
  list(input: MarketplaceQuery, transaction?: Transaction) {
    const work = async (database: Transaction) =>
      discoveryPage(
        await readPublicDiscoveryRows(
          database,
          input,
          this.clock(),
          this.textRadiusMeters,
          this.bucket,
        ),
        input,
      );
    return transaction ? work(transaction) : this.database.transaction(work);
  }

  overview(branchId: string, input: MarketplaceQuery) {
    return this.database.transaction(
      async (database) => {
        const now = this.clock();
        const [row] = await this.query(database, input, now, branchId).limit(1);
        if (!row || row.branchId !== branchId)
          throw new DomainError('NOT_FOUND', 404, 'Listing unavailable');
        const filters = { ...input };
        delete filters.cursor;
        const summaries = projectDiscoveryPage(
          await readPublicDiscoveryRows(
            database,
            { ...filters, ids: [branchId], limit: 1 },
            now,
            this.textRadiusMeters,
            this.bucket,
          ),
          1,
          input.moveInDate !== undefined && input.moveOutDate !== undefined,
          undefined,
          [branchId],
        );
        const summary = summaries.data[0];
        if (!summary || summary.branchId !== branchId)
          throw new DomainError('NOT_FOUND', 404, 'Listing unavailable');
        return projectPublicPage(listingOverviewSchema, { ...row, ...summary });
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  details(branchId: string, input: MarketplaceQuery) {
    return this.database.transaction(async (database) => {
      const now = this.clock(),
        [row] = await this.query(database, input, now, branchId).limit(1);
      if (!row) throw new DomainError('NOT_FOUND', 404, 'Listing unavailable');
      const supplements = await this.supplements(database, branchId, input, now);
      const selectedAmenities = await publicRoomAmenities(
        database,
        branchId,
        supplements.roomTypes.map((type) => type.id),
      );
      return listingInventoryDetailsSchema.parse({
        ...row,
        ...supplements,
        roomTypes: supplements.roomTypes.map((type) => ({
          ...type,
          amenities: selectedAmenities.get(type.id) ?? [],
        })),
      });
    });
  }
  institutions(page: ManagementPage, text?: string, radiusMeters = this.textRadiusMeters) {
    return this.database.transaction(async (database) => {
      const pattern = text
        ? '%' + text.replaceAll('%', '\\%').replaceAll('_', '\\_') + '%'
        : undefined;
      const rows = await database
        .select({
          id: places.id,
          type: places.type,
          name: places.name,
          shortName: places.shortName,
          cityId: places.cityId,
          latitude: sql<number>`ST_Y(${places.location}::geometry)`,
          longitude: sql<number>`ST_X(${places.location}::geometry)`,
        })
        .from(places)
        .innerJoin(cities, eq(cities.id, places.cityId))
        .where(
          and(
            // CHG-033: browsing lists campuses; typing searches every place and locality.
            pattern ? undefined : eq(places.type, 'university'),
            eq(places.isActive, true),
            isNotNull(places.publicApprovedAt),
            eq(cities.isActive, true),
            page.cursor && !pattern ? gt(places.id, page.cursor) : undefined,
            pattern
              ? or(
                  ilike(places.name, pattern),
                  ilike(places.shortName, pattern),
                  exists(
                    database
                      .select({ id: placeAliases.placeId })
                      .from(placeAliases)
                      .where(
                        and(
                          eq(placeAliases.placeId, places.id),
                          ilike(placeAliases.alias, pattern),
                        ),
                      ),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(...(text ? placeRelevance(text) : []), places.id)
        .limit(page.limit + 1);
      const selected = rows.slice(0, page.limit);
      const counts = await publicInstitutionCounts(
        database,
        selected.map((place) => place.id),
        radiusMeters,
      );
      return institutionPageSchema.parse({
        data: selected.map((place) => ({ ...place, hostelCount: counts.get(place.id) ?? 0 })),
        nextCursor: !pattern && rows.length > page.limit ? selected.at(-1)?.id : null,
      });
    });
  }
}
