import { eq, and } from 'drizzle-orm';
import { v7 } from 'uuid';
import { buildings, floors, rooms } from '@hsm/db';
import type {
  PropertyBuildingInput,
  PropertyFloorInput,
  PropertyArchiveInput,
  PropertyRoomLocationInput,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import type { lockInventoryScope } from './scope.js';
import {
  lockBuilding,
  lockFloor,
  lockPropertyRoom,
  requireActiveProperty,
  nextPropertyVersion,
  projectBuilding,
  projectFloor,
  readRoomLocation,
  propertyUnavailable,
} from './property-structure-state.js';

export type PropertyContext = {
  tx: Transaction;
  actor: Actor;
  branchId: string;
  scope: Awaited<ReturnType<typeof lockInventoryScope>>;
  now: Date;
  audit: AuditWriter;
};
async function record(
  c: PropertyContext,
  kind: string,
  id: string,
  action: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
  reason?: string,
) {
  await c.audit.hostel(c.tx, {
    actorUserId: c.actor.userId,
    actorRole: c.scope.actorRole,
    organizationId: c.scope.organizationId,
    branchId: c.branchId,
    action: 'property.' + action,
    targetType: kind,
    targetId: id,
    before,
    after: { ...after, ...(reason ? { reason } : {}) },
    createdAt: c.now,
  });
}
export async function createPropertyBuilding(c: PropertyContext, input: PropertyBuildingInput) {
  const [row] = await c.tx
    .insert(buildings)
    .values({ id: v7(), branchId: c.branchId, ...input, createdAt: c.now, updatedAt: c.now })
    .returning();
  if (
    !row ||
    row.branchId !== c.branchId ||
    row.name !== input.name ||
    row.sortOrder !== input.sortOrder ||
    row.version !== 1 ||
    row.archivedAt !== null
  )
    propertyUnavailable();
  const result = projectBuilding(row);
  await record(c, 'building', result.id, 'building.created', null, {
    id: result.id,
    version: result.version,
  });
  return result;
}
export async function createPropertyFloor(c: PropertyContext, input: PropertyFloorInput) {
  const parent = await lockBuilding(c.tx, c.branchId, input.buildingId);
  requireActiveProperty(parent.archivedAt);
  const [row] = await c.tx
    .insert(floors)
    .values({ id: v7(), branchId: c.branchId, ...input, createdAt: c.now, updatedAt: c.now })
    .returning();
  if (
    !row ||
    row.branchId !== c.branchId ||
    row.buildingId !== input.buildingId ||
    row.label !== input.label ||
    row.levelNumber !== input.levelNumber ||
    row.version !== 1 ||
    row.archivedAt !== null
  )
    propertyUnavailable();
  const result = projectFloor(row);
  await record(c, 'floor', result.id, 'floor.created', null, {
    id: result.id,
    buildingId: result.buildingId,
    version: result.version,
  });
  return result;
}
export async function archivePropertyBuilding(
  c: PropertyContext,
  id: string,
  input: PropertyArchiveInput,
) {
  const before = await lockBuilding(c.tx, c.branchId, id);
  requireActiveProperty(before.archivedAt);
  const version = nextPropertyVersion(before.version, input.expectedVersion);
  const [row] = await c.tx
    .update(buildings)
    .set({ archivedAt: c.now, updatedAt: c.now, version })
    .where(and(eq(buildings.branchId, c.branchId), eq(buildings.id, id)))
    .returning();
  if (
    !row ||
    row.branchId !== c.branchId ||
    row.id !== id ||
    row.version !== version ||
    row.archivedAt?.getTime() !== c.now.getTime()
  )
    propertyUnavailable();
  const result = projectBuilding(row);
  await record(
    c,
    'building',
    id,
    'building.archived',
    { version: before.version },
    { version },
    input.reason,
  );
  return result;
}
export async function archivePropertyFloor(
  c: PropertyContext,
  id: string,
  input: PropertyArchiveInput,
) {
  const before = await lockFloor(c.tx, c.branchId, id);
  requireActiveProperty(before.archivedAt);
  const version = nextPropertyVersion(before.version, input.expectedVersion);
  const [row] = await c.tx
    .update(floors)
    .set({ archivedAt: c.now, updatedAt: c.now, version })
    .where(and(eq(floors.branchId, c.branchId), eq(floors.id, id)))
    .returning();
  if (
    !row ||
    row.branchId !== c.branchId ||
    row.id !== id ||
    row.version !== version ||
    row.archivedAt?.getTime() !== c.now.getTime()
  )
    propertyUnavailable();
  const result = projectFloor(row);
  await record(
    c,
    'floor',
    id,
    'floor.archived',
    { version: before.version },
    { version },
    input.reason,
  );
  return result;
}
export async function savePropertyRoomLocation(
  c: PropertyContext,
  id: string,
  input: PropertyRoomLocationInput,
) {
  const before = await lockPropertyRoom(c.tx, c.branchId, id);
  requireActiveProperty(before.archivedAt);
  const version = nextPropertyVersion(before.locationVersion, input.expectedVersion);
  if (input.floorId !== null) {
    const floor = await lockFloor(c.tx, c.branchId, input.floorId);
    requireActiveProperty(floor.archivedAt);
    requireActiveProperty((await lockBuilding(c.tx, c.branchId, floor.buildingId)).archivedAt);
  }
  const [written] = await c.tx
    .update(rooms)
    .set({ floorId: input.floorId, locationVersion: version, updatedAt: c.now })
    .where(and(eq(rooms.branchId, c.branchId), eq(rooms.id, id)))
    .returning({
      id: rooms.id,
      branchId: rooms.branchId,
      floorId: rooms.floorId,
      version: rooms.locationVersion,
    });
  if (
    !written ||
    written.id !== id ||
    written.branchId !== c.branchId ||
    written.floorId !== input.floorId ||
    written.version !== version
  )
    propertyUnavailable();
  await record(
    c,
    'room',
    id,
    'room.location_changed',
    { floorId: before.floorId, version: before.locationVersion },
    { floorId: input.floorId, version },
    input.reason,
  );
  return readRoomLocation(c.tx, c.branchId, id, true);
}
