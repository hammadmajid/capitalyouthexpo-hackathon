import { and, asc, eq, gt, ilike, isNull } from 'drizzle-orm';
import { buildings, floors, type Database } from '@hsm/db';
import {
  DomainError,
  inventoryPageSequenceIsValid,
  propertyBuildingPageSchema,
  propertyFloorPageSchema,
  type PropertyPageQuery,
  type PropertyBuildingInput,
  type PropertyFloorInput,
  type PropertyArchiveInput,
  type PropertyRoomLocationInput,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { lockActor } from '../auth/actor-lock.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { lockInventoryScope } from './scope.js';
import { inventoryPermissions } from './permissions.js';
import {
  lockBuilding,
  lockFloor,
  lockPropertyRoom,
  projectBuilding,
  projectFloor,
  readRoomLocation,
  propertyUnavailable,
} from './property-structure-state.js';
import {
  createPropertyBuilding,
  createPropertyFloor,
  archivePropertyBuilding,
  archivePropertyFloor,
  savePropertyRoomLocation,
  type PropertyContext,
} from './property-structure-commands.js';

export type PropertyTarget = { kind: 'building' | 'floor' | 'room'; id: string };
function page<T extends { id: string }>(rows: T[], query: PropertyPageQuery) {
  if (rows.length > query.limit + 1 || !inventoryPageSequenceIsValid(rows, query.cursor))
    propertyUnavailable();
  const data = rows.slice(0, query.limit);
  return { data, nextCursor: rows.length > query.limit ? (data.at(-1)?.id ?? null) : null };
}
function search(value: string | undefined) {
  return value === undefined ? undefined : '%' + value.replace(/[\\%_]/g, '\\$&') + '%';
}
export class PropertyStructureRepository {
  constructor(
    private readonly database: Database,
    private readonly audit = new AuditWriter(),
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async authorize(
    tx: Transaction,
    actor: Actor,
    branchId: string,
    target?: PropertyTarget,
    edit = true,
  ) {
    await lockActor(tx, actor, this.clock);
    const scope = await lockInventoryScope(
      tx,
      actor,
      branchId,
      edit ? 'inventory_edit' : undefined,
    );
    if (target?.kind === 'building') await lockBuilding(tx, branchId, target.id);
    if (target?.kind === 'floor') await lockFloor(tx, branchId, target.id);
    if (target?.kind === 'room') await lockPropertyRoom(tx, branchId, target.id);
    await lockActor(tx, actor, this.clock);
    return scope;
  }
  authorizeRelatedFloor(tx: Transaction, branchId: string, floorId: string) {
    return lockFloor(tx, branchId, floorId);
  }
  private async access(tx: Transaction, actor: Actor, branchId: string, target?: PropertyTarget) {
    const scope = await this.authorize(tx, actor, branchId, target, false);
    const grants = await inventoryPermissions(tx, actor, branchId, scope.actorRole === 'owner');
    return grants.permissions.includes('inventory_edit');
  }
  buildingPage(actor: Actor, branchId: string, query: PropertyPageQuery) {
    if (query.buildingId !== undefined)
      throw new DomainError(
        'VALIDATION_FAILED',
        400,
        'Building parent filter is only applicable to floors',
      );
    return this.database.transaction(async (tx) => {
      const canEdit = await this.access(tx, actor, branchId),
        pattern = search(query.search);
      const rows = await tx
        .select()
        .from(buildings)
        .where(
          and(
            eq(buildings.branchId, branchId),
            query.view === 'active' ? isNull(buildings.archivedAt) : undefined,
            query.cursor ? gt(buildings.id, query.cursor) : undefined,
            pattern ? ilike(buildings.name, pattern) : undefined,
          ),
        )
        .orderBy(asc(buildings.id))
        .limit(query.limit + 1);
      if (rows.some((row) => row.branchId !== branchId)) propertyUnavailable();
      const result = page(rows.map(projectBuilding), query);
      await lockActor(tx, actor, this.clock);
      return propertyBuildingPageSchema.parse({ branchId, canEdit, ...result });
    });
  }
  floorPage(actor: Actor, branchId: string, query: PropertyPageQuery) {
    const buildingId = query.buildingId;
    if (buildingId === undefined)
      throw new DomainError('VALIDATION_FAILED', 400, 'Select a building for the floor page');
    return this.database.transaction(async (tx) => {
      const canEdit = await this.access(tx, actor, branchId, { kind: 'building', id: buildingId });
      const parent = await lockBuilding(tx, branchId, buildingId),
        pattern = search(query.search);
      const rows = await tx
        .select()
        .from(floors)
        .where(
          and(
            eq(floors.branchId, branchId),
            eq(floors.buildingId, buildingId),
            query.view === 'active' ? isNull(floors.archivedAt) : undefined,
            query.cursor ? gt(floors.id, query.cursor) : undefined,
            pattern ? ilike(floors.label, pattern) : undefined,
          ),
        )
        .orderBy(asc(floors.id))
        .limit(query.limit + 1);
      if (rows.some((row) => row.branchId !== branchId || row.buildingId !== buildingId))
        propertyUnavailable();
      const result = page(rows.map(projectFloor), query);
      await lockActor(tx, actor, this.clock);
      return propertyFloorPageSchema.parse({
        branchId,
        buildingId,
        canEdit: canEdit && parent.archivedAt === null,
        ...result,
      });
    });
  }
  roomLocation(actor: Actor, branchId: string, roomId: string) {
    return this.database.transaction(async (tx) => {
      const canEdit = await this.access(tx, actor, branchId, { kind: 'room', id: roomId });
      const result = await readRoomLocation(tx, branchId, roomId, canEdit);
      await lockActor(tx, actor, this.clock);
      return result;
    });
  }
  private async context(
    tx: Transaction,
    actor: Actor,
    branchId: string,
    target?: PropertyTarget,
  ): Promise<PropertyContext> {
    return {
      tx,
      actor,
      branchId,
      scope: await this.authorize(tx, actor, branchId, target),
      now: this.clock(),
      audit: this.audit,
    };
  }
  private async finish<T>(c: PropertyContext, result: T) {
    await lockActor(c.tx, c.actor, this.clock);
    return result;
  }
  async createBuilding(
    tx: Transaction,
    actor: Actor,
    branchId: string,
    input: PropertyBuildingInput,
  ) {
    const c = await this.context(tx, actor, branchId);
    return this.finish(c, await createPropertyBuilding(c, input));
  }
  async createFloor(tx: Transaction, actor: Actor, branchId: string, input: PropertyFloorInput) {
    const c = await this.context(tx, actor, branchId, { kind: 'building', id: input.buildingId });
    return this.finish(c, await createPropertyFloor(c, input));
  }
  async archiveBuilding(
    tx: Transaction,
    actor: Actor,
    branchId: string,
    id: string,
    input: PropertyArchiveInput,
  ) {
    const c = await this.context(tx, actor, branchId, { kind: 'building', id });
    return this.finish(c, await archivePropertyBuilding(c, id, input));
  }
  async archiveFloor(
    tx: Transaction,
    actor: Actor,
    branchId: string,
    id: string,
    input: PropertyArchiveInput,
  ) {
    const c = await this.context(tx, actor, branchId, { kind: 'floor', id });
    return this.finish(c, await archivePropertyFloor(c, id, input));
  }
  async saveRoomLocation(
    tx: Transaction,
    actor: Actor,
    branchId: string,
    id: string,
    input: PropertyRoomLocationInput,
  ) {
    const c = await this.context(tx, actor, branchId, { kind: 'room', id });
    return this.finish(c, await savePropertyRoomLocation(c, id, input));
  }
}
