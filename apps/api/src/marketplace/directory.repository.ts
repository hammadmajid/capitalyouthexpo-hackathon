import { and, eq, sql } from 'drizzle-orm';
import { v7 } from 'uuid';
import { places, placeAliases, cities, areas, adminAccounts } from '@hsm/db';
import { DomainError, institutionStateSchema, institutionInputSchema } from '@hsm/contracts';
import type { z } from 'zod';
import type { Actor } from '../authorization/store.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { ScopeRepository } from '../authorization/repository.js';
import { institutionRevision } from './institution-revision.js';
import { nextInstitutionApproval } from './institution-approval-policy.js';
export class InstitutionRepository {
  constructor(
    private readonly audit = new AuditWriter(),
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async authorize(database: Transaction, actor: Actor) {
    const [account] = await database
      .select({ id: adminAccounts.userId })
      .from(adminAccounts)
      .where(
        and(
          eq(adminAccounts.userId, actor.userId),
          eq(adminAccounts.isRoot, true),
          eq(adminAccounts.status, 'active'),
        ),
      )
      .for('update');
    const root = await new ScopeRepository(database).admin(actor.userId);
    if (!account || !root?.isRoot)
      throw new DomainError('FORBIDDEN', 403, 'Root directory scope required');
    return true;
  }
  async save(
    database: Transaction,
    actor: Actor,
    input: z.infer<typeof institutionInputSchema> & {
      expectedRevision?: string;
      changeReason?: string;
      reapprove?: boolean;
    },
    placeId?: string,
  ) {
    if (!input.changeReason || input.changeReason.trim().length < 8)
      throw new DomainError(
        'VALIDATION_FAILED',
        400,
        'A meaningful institution change reason is required',
      );
    let before: z.infer<typeof institutionInputSchema> | null = null;
    let previousRevision: string | null = null;
    let approval = 'created';
    const [city] = await database
      .select({ id: cities.id })
      .from(cities)
      .where(and(eq(cities.id, input.cityId), eq(cities.isActive, true)));
    if (!city) throw new DomainError('NOT_FOUND', 404, 'City unavailable');
    if (input.areaId) {
      const [area] = await database
        .select({ id: areas.id })
        .from(areas)
        .where(
          and(eq(areas.id, input.areaId), eq(areas.cityId, input.cityId), eq(areas.isActive, true)),
        );
      if (!area) throw new DomainError('NOT_FOUND', 404, 'Area unavailable');
    }
    const id = placeId ?? v7(),
      now = this.clock();
    const values = {
      type: input.type,
      name: input.name,
      shortName: input.shortName,
      cityId: input.cityId,
      areaId: input.areaId,
      address: input.address,
      location: sql`ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)::geography`,
      isActive: input.isActive,
      publicApprovedAt: input.publicApproved ? now : null,
      publicApprovedByUserId: input.publicApproved ? actor.userId : null,
    };
    if (placeId) {
      const [place] = await database
        .select({
          id: places.id,
          publicApprovedAt: places.publicApprovedAt,
          publicApprovedByUserId: places.publicApprovedByUserId,
        })
        .from(places)
        .where(eq(places.id, placeId))
        .for('update');
      if (!place) throw new DomainError('NOT_FOUND', 404, 'Institution unavailable');
      const [current] = await database
        .select({ revision: institutionRevision })
        .from(places)
        .where(eq(places.id, id))
        .limit(1);

      if (!current || !input.expectedRevision || input.expectedRevision !== current.revision) {
        throw new DomainError(
          'CONFLICT',
          409,
          'Institution changed. Refresh its details before saving.',
        );
      }
      const [snapshot] = await database
        .select({
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
        })
        .from(places)
        .where(eq(places.id, id))
        .limit(1);
      const aliases = await database
        .select({ alias: placeAliases.alias })
        .from(placeAliases)
        .where(eq(placeAliases.placeId, id));
      before = institutionInputSchema.parse({
        ...snapshot,
        aliases: aliases.map((a) => a.alias).sort(),
      });
      previousRevision = current.revision;
      const material = [
        'type',
        'name',
        'shortName',
        'cityId',
        'areaId',
        'address',
        'latitude',
        'longitude',
        'aliases',
      ] as const;
      const proposed = institutionInputSchema.parse(
        Object.fromEntries(
          Object.entries({ ...input, aliases: [...input.aliases].sort() }).filter(
            ([key]) => !['expectedRevision', 'changeReason', 'reapprove'].includes(key),
          ),
        ),
      );
      const changed = material.some(
        (key) => JSON.stringify(before?.[key]) !== JSON.stringify(proposed[key]),
      );
      if (before.publicApproved && input.publicApproved && changed && !input.reapprove)
        throw new DomainError(
          'CONFLICT',
          409,
          'Material institution changes require explicit reapproval or withdrawal of public approval',
        );
      approval = !input.publicApproved
        ? 'withdrawn'
        : input.reapprove
          ? 'reapproved'
          : before.publicApproved
            ? 'preserved'
            : 'approved';
      await database
        .update(places)
        .set({
          ...values,
          ...nextInstitutionApproval(
            {
              publicApprovedAt: place.publicApprovedAt,
              publicApprovedByUserId: place.publicApprovedByUserId,
            },
            input.publicApproved,
            actor.userId,
            now,
            input.reapprove,
          ),
        })
        .where(eq(places.id, id));
      await database.delete(placeAliases).where(eq(placeAliases.placeId, id));
    } else await database.insert(places).values({ id, slug: 'institution-' + id, ...values });
    if (input.aliases.length)
      await database
        .insert(placeAliases)
        .values(input.aliases.map((alias) => ({ placeId: id, alias })));
    const result = institutionStateSchema.parse({
      id,
      isActive: input.isActive,
      publicApproved: input.publicApproved,
    });
    await this.audit.platform(database, {
      actorUserId: actor.userId,
      actorRole: 'root',
      action: 'institution.saved',
      targetType: 'place',
      targetId: id,
      before: before ? { institution: before, revision: previousRevision } : null,
      after: {
        institution: institutionInputSchema.parse(
          Object.fromEntries(
            Object.entries(input).filter(
              ([key]) => !['expectedRevision', 'changeReason', 'reapprove'].includes(key),
            ),
          ),
        ),
        previousRevision,
        reason: input.changeReason.trim(),
        approval,
      },
      createdAt: now,
    });
    return result;
  }
}
