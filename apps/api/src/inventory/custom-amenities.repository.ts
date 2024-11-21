import { createHash } from 'node:crypto';
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { v7 } from 'uuid';
import { amenities, type Database } from '@hsm/db';
import {
  customAmenitySchema,
  customAmenityPageSchema,
  DomainError,
  type AmenityCatalogQuery,
  type CustomAmenityCommand,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from './scope.js';
function project(row: typeof amenities.$inferSelect) {
  const version = createHash('sha256').update(JSON.stringify(row)).digest('hex');
  return customAmenitySchema.parse({ ...row, version });
}
export class CustomAmenitiesRepository {
  constructor(
    private readonly database: Database,
    private readonly clock: () => Date,
    private readonly audit = new AuditWriter(),
  ) {}
  async authorize(tx: Transaction, actor: Actor, branchId: string, write = true) {
    await lockActor(tx, actor, this.clock);
    const scope = await lockInventoryScope(
      tx,
      actor,
      branchId,
      write ? 'listing_edit' : undefined,
      write,
    );
    await lockActor(tx, actor, this.clock);
    return scope;
  }
  read(actor: Actor, branchId: string, query: AmenityCatalogQuery) {
    return this.database.transaction(async (tx) => {
      const scope = await this.authorize(tx, actor, branchId, false);
      const rows = await tx
        .select()
        .from(amenities)
        .where(
          and(
            eq(amenities.organizationId, scope.organizationId),
            query.cursor ? gt(amenities.code, query.cursor) : undefined,
          ),
        )
        .orderBy(amenities.code)
        .limit(query.limit + 1);
      const data = rows.slice(0, query.limit).map(project);
      return customAmenityPageSchema.parse({
        branchId,
        organizationId: scope.organizationId,
        canEdit: scope.actorRole === 'owner',
        data,
        nextCursor: rows.length > query.limit ? (data.at(-1)?.code ?? null) : null,
      });
    });
  }
  async write(tx: Transaction, actor: Actor, branchId: string, input: CustomAmenityCommand) {
    const scope = await this.authorize(tx, actor, branchId);
    let before: ReturnType<typeof project> | null = null;
    const code = input.kind === 'create' ? 'custom_' + v7().replaceAll('-', '') : input.code;
    if (input.kind !== 'create') {
      const [row] = await tx
        .select()
        .from(amenities)
        .where(and(eq(amenities.code, code), eq(amenities.organizationId, scope.organizationId)))
        .for('update');
      if (!row) throw new DomainError('NOT_FOUND', 404, 'Custom amenity unavailable');
      before = project(row);
      if (before.version !== input.version)
        throw new DomainError('PRECONDITION_FAILED', 412, 'Amenity changed');
      if (!before.isActive) throw new DomainError('CONFLICT', 409, 'Amenity is archived');
    }
    if (input.kind !== 'archive') {
      const [duplicate] = await tx
        .select({ code: amenities.code })
        .from(amenities)
        .where(
          and(
            or(
              isNull(amenities.organizationId),
              eq(amenities.organizationId, scope.organizationId),
            ),
            eq(sql<string>`lower(btrim(${amenities.name}))`, input.name.toLowerCase()),
          ),
        );
      if (duplicate && duplicate.code !== code)
        throw new DomainError('CONFLICT', 409, 'Amenity name already exists');
    }
    const values =
      input.kind === 'archive'
        ? { isActive: false }
        : { name: input.name, category: input.category };
    const [saved] =
      input.kind === 'create'
        ? await tx
            .insert(amenities)
            .values({
              code,
              organizationId: scope.organizationId,
              name: input.name,
              category: input.category,
              isActive: true,
            })
            .returning()
        : await tx
            .update(amenities)
            .set(values)
            .where(
              and(eq(amenities.code, code), eq(amenities.organizationId, scope.organizationId)),
            )
            .returning();
    if (!saved) throw new DomainError('INTERNAL', 500, 'Amenity unavailable');
    const after = project(saved);
    await this.audit.hostel(tx, {
      actorUserId: actor.userId,
      actorRole: scope.actorRole,
      organizationId: scope.organizationId,
      branchId,
      action: 'amenity.' + input.kind,
      targetType: 'organization',
      targetId: scope.organizationId,
      before,
      after: { ...after, ...(input.kind === 'archive' ? { reason: input.reason } : {}) },
      createdAt: this.clock(),
    });
    return after;
  }
}
