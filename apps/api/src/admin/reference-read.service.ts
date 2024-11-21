import { and, asc, desc, eq, gt, ilike, lt, sql } from 'drizzle-orm';
import { announcements, cities, placeAliases, places, type Database } from '@hsm/db';
import {
  adminAnnouncementPageSchema,
  adminAnnouncementQuerySchema,
  adminInstitutionPageSchema,
  adminInstitutionQuerySchema,
  adminInstitutionSchema,
  DomainError,
  stayIdentifierSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import { lockAdmin } from './scope.js';
import { InstitutionHistoryService } from './institution-history.service.js';
import { institutionRevision } from '../marketplace/institution-revision.js';
const fields = {
  id: places.id,
  type: places.type,
  name: places.name,
  shortName: places.shortName,
  cityId: places.cityId,
  areaId: places.areaId,
  address: places.address,
  latitude: sql<number>`ST_Y(${places.location}::geometry)`,
  longitude: sql<number>`ST_X(${places.location}::geometry)`,
  isActive: places.isActive,
  publicApproved: sql<boolean>`${places.publicApprovedAt} is not null`,
  revision: institutionRevision,
};
async function projectInstitutions(
  tx: Transaction,
  rows: Awaited<ReturnType<typeof institutionRows>>,
) {
  const result = [];
  for (const row of rows) {
    const aliases = await tx
      .select({ alias: placeAliases.alias })
      .from(placeAliases)
      .where(eq(placeAliases.placeId, row.id))
      .orderBy(asc(placeAliases.alias));
    result.push(adminInstitutionSchema.parse({ ...row, aliases: aliases.map((a) => a.alias) }));
  }
  return result;
}
function institutionRows(tx: Transaction) {
  return tx.select(fields).from(places).$dynamic();
}
export class AdminReferenceReadService {
  institutionHistory(actor: Actor, placeId: unknown, query: unknown) {
    return new InstitutionHistoryService(this.database, this.clock).read(actor, placeId, query);
  }
  constructor(
    private readonly database: Database,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  announcements(actor: Actor, query: unknown) {
    const input = adminAnnouncementQuerySchema.parse(query);
    return this.database.transaction(async (tx) => {
      await lockAdmin(tx, actor, 'support', this.clock);
      const rows = await tx
        .select()
        .from(announcements)
        .where(
          and(
            input.status ? eq(announcements.status, input.status) : undefined,
            input.cursor ? lt(announcements.id, input.cursor) : undefined,
          ),
        )
        .orderBy(desc(announcements.id))
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      return adminAnnouncementPageSchema.parse({
        data: page.map((row) => ({
          id: row.id,
          audience: row.audience,
          title: row.title,
          body: row.body,
          status: row.status,
          scheduledAt: row.scheduledAt.toISOString(),
          sentAt: row.sentAt?.toISOString() ?? null,
          recipientCount: row.recipientCount,
          version: row.version,
          branchIds: row.branchIds,
          cityId: row.cityId,
          createdAt: row.createdAt.toISOString(),
        })),
        nextCursor: rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
      });
    });
  }
  institutions(actor: Actor, query: unknown) {
    const input = adminInstitutionQuerySchema.parse(query),
      literal = input.q?.replace(/[\\%_]/g, '\\$&');
    return this.database.transaction(async (tx) => {
      await lockAdmin(tx, actor, 'root', this.clock);
      const rows = await institutionRows(tx)
        .where(
          and(
            // CHG-034: every place category, optionally one type at a time.
            input.type ? eq(places.type, input.type) : undefined,
            input.active === 'all' ? undefined : eq(places.isActive, input.active === 'active'),
            literal ? ilike(places.name, '%' + literal + '%') : undefined,
            input.cursor ? gt(places.id, input.cursor) : undefined,
          ),
        )
        .orderBy(asc(places.id))
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      const cityRows = await tx
        .select({ id: cities.id, name: cities.name })
        .from(cities)
        .where(eq(cities.isActive, true))
        .orderBy(asc(cities.sortOrder), asc(cities.name))
        .limit(100);
      return adminInstitutionPageSchema.parse({
        data: await projectInstitutions(tx, page),
        nextCursor: rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
        cities: cityRows,
      });
    });
  }
  institution(actor: Actor, placeId: unknown) {
    const id = stayIdentifierSchema.parse(placeId);
    return this.database.transaction(async (tx) => {
      await lockAdmin(tx, actor, 'root', this.clock);
      const rows = await institutionRows(tx).where(eq(places.id, id)).limit(1);
      if (!rows.length) throw new DomainError('NOT_FOUND', 404, 'Institution unavailable');
      return (await projectInstitutions(tx, rows))[0];
    });
  }
}
