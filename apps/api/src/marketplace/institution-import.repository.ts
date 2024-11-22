import { and, eq, sql } from 'drizzle-orm';
import { v7 } from 'uuid';
import { cities, placeAliases, places } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { InstitutionRepository } from './directory.repository.js';
import type { OsmInstitution } from './osm-institutions.js';
export type ImportCounts = { added: number; skipped: number };
// CHG-032: the slug carries the OpenStreetMap reference, so a rerun never duplicates a place.
// The same name within 150 m (for example one entered by hand) is left untouched.
export class InstitutionImportRepository {
  constructor(
    private readonly audit = new AuditWriter(),
    private readonly clock: () => Date = () => new Date(),
    private readonly roots = new InstitutionRepository(audit, clock),
  ) {}
  async import(
    database: Transaction,
    actor: Actor,
    citySlug: string,
    candidates: OsmInstitution[],
  ): Promise<ImportCounts> {
    await this.roots.authorize(database, actor);
    const [city] = await database
      .select({ id: cities.id })
      .from(cities)
      .where(and(eq(cities.slug, citySlug), eq(cities.isActive, true)));
    if (!city) throw new DomainError('NOT_FOUND', 404, 'City unavailable');
    const now = this.clock();
    const counts: ImportCounts = { added: 0, skipped: 0 };
    for (const item of candidates) {
      if (await this.exists(database, city.id, item)) {
        counts.skipped += 1;
        continue;
      }
      await this.insert(database, actor, city.id, item, now);
      counts.added += 1;
    }
    return counts;
  }
  private async exists(database: Transaction, cityId: string, item: OsmInstitution) {
    const [found] = await database
      .select({ id: places.id })
      .from(places)
      .where(
        sql`${places.slug} = ${slugFor(item)} or (${places.cityId} = ${cityId}
 and lower(${places.name}) = lower(${item.name})
 and ST_DWithin(${places.location}, ${point(item)}, 150))`,
      )
      .limit(1);
    return Boolean(found);
  }
  private async insert(
    database: Transaction,
    actor: Actor,
    cityId: string,
    item: OsmInstitution,
    now: Date,
  ) {
    const id = v7();
    await database.insert(places).values({
      id,
      type: item.type,
      slug: slugFor(item),
      name: item.name,
      shortName: item.shortName,
      cityId,
      areaId: null,
      address: item.address,
      location: point(item),
      isActive: true,
      publicApprovedAt: now,
      publicApprovedByUserId: actor.userId,
    });
    if (item.aliases.length)
      await database
        .insert(placeAliases)
        .values(item.aliases.map((alias) => ({ placeId: id, alias })))
        .onConflictDoNothing();
    await this.audit.platform(database, {
      actorUserId: actor.userId,
      actorRole: 'root',
      action: 'institution.imported',
      targetType: 'place',
      targetId: id,
      before: null,
      after: {
        source: 'openstreetmap',
        sourceRef: item.sourceRef,
        type: item.type,
        name: item.name,
        cityId,
      },
    });
  }
}
const point = (item: OsmInstitution) =>
  sql`ST_SetSRID(ST_MakePoint(${item.longitude}, ${item.latitude}), 4326)::geography`;
export const slugFor = (item: OsmInstitution) => 'osm-' + item.sourceRef.replace('/', '-');
