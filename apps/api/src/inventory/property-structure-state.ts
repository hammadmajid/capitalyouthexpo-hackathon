import { and, eq } from 'drizzle-orm';
import { buildings, floors, rooms } from '@hsm/db';
import {
  DomainError,
  propertyBuildingSchema,
  propertyFloorSchema,
  propertyRoomLocationSchema,
} from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';

export function propertyUnavailable(): never {
  throw new DomainError('INTERNAL', 500, 'Property structure unavailable');
}
function instant(value: Date | null) {
  if (value === null) return null;
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) propertyUnavailable();
  return value.toISOString();
}
export function projectBuilding(row: typeof buildings.$inferSelect) {
  const result = propertyBuildingSchema.safeParse({
    id: row.id,
    branchId: row.branchId,
    name: row.name,
    sortOrder: row.sortOrder,
    version: row.version,
    archivedAt: instant(row.archivedAt),
  });
  return result.success ? result.data : propertyUnavailable();
}
export function projectFloor(row: typeof floors.$inferSelect) {
  const result = propertyFloorSchema.safeParse({
    id: row.id,
    branchId: row.branchId,
    buildingId: row.buildingId,
    label: row.label,
    levelNumber: row.levelNumber,
    version: row.version,
    archivedAt: instant(row.archivedAt),
  });
  return result.success ? result.data : propertyUnavailable();
}
export async function lockBuilding(tx: Transaction, branchId: string, id: string) {
  const [row] = await tx
    .select()
    .from(buildings)
    .where(and(eq(buildings.branchId, branchId), eq(buildings.id, id)))
    .for('update');
  if (!row || row.branchId !== branchId || row.id !== id)
    throw new DomainError('NOT_FOUND', 404, 'Building unavailable');
  return row;
}
export async function lockFloor(tx: Transaction, branchId: string, id: string) {
  const [row] = await tx
    .select()
    .from(floors)
    .where(and(eq(floors.branchId, branchId), eq(floors.id, id)))
    .for('update');
  if (!row || row.branchId !== branchId || row.id !== id)
    throw new DomainError('NOT_FOUND', 404, 'Floor unavailable');
  return row;
}
export async function lockPropertyRoom(tx: Transaction, branchId: string, id: string) {
  const [row] = await tx
    .select()
    .from(rooms)
    .where(and(eq(rooms.branchId, branchId), eq(rooms.id, id)))
    .for('update');
  if (!row || row.branchId !== branchId || row.id !== id)
    throw new DomainError('NOT_FOUND', 404, 'Room unavailable');
  return row;
}
export function requireActiveProperty(archivedAt: Date | null) {
  if (archivedAt !== null)
    throw new DomainError('CONFLICT', 409, 'Archived property cannot be edited');
}
export function nextPropertyVersion(actual: number, expected: number) {
  if (!Number.isInteger(actual) || actual < 1 || actual > 2147483647) propertyUnavailable();
  if (actual !== expected)
    throw new DomainError('PRECONDITION_FAILED', 412, 'Property changed; refresh current metadata');
  if (actual === 2147483647) throw new DomainError('CONFLICT', 409, 'Property version exhausted');
  return actual + 1;
}
export async function readRoomLocation(
  tx: Transaction,
  branchId: string,
  roomId: string,
  canEdit: boolean,
) {
  const [row] = await tx
    .select({
      roomId: rooms.id,
      branchId: rooms.branchId,
      roomLabel: rooms.label,
      version: rooms.locationVersion,
      archivedAt: rooms.archivedAt,
      floorId: rooms.floorId,
      floorLabel: floors.label,
      buildingId: floors.buildingId,
      buildingName: buildings.name,
    })
    .from(rooms)
    .leftJoin(floors, and(eq(floors.id, rooms.floorId), eq(floors.branchId, rooms.branchId)))
    .leftJoin(
      buildings,
      and(eq(buildings.id, floors.buildingId), eq(buildings.branchId, rooms.branchId)),
    )
    .where(and(eq(rooms.branchId, branchId), eq(rooms.id, roomId)));
  if (!row || row.branchId !== branchId || row.roomId !== roomId)
    throw new DomainError('NOT_FOUND', 404, 'Room unavailable');
  const result = propertyRoomLocationSchema.safeParse({
    branchId,
    roomId,
    roomLabel: row.roomLabel,
    version: row.version,
    canEdit: canEdit && row.archivedAt === null,
    archivedAt: instant(row.archivedAt),
    floor:
      row.floorId === null
        ? null
        : {
            id: row.floorId,
            label: row.floorLabel,
            buildingId: row.buildingId,
            buildingName: row.buildingName,
          },
  });
  return result.success ? result.data : propertyUnavailable();
}
