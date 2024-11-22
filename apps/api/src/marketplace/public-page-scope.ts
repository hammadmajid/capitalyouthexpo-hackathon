import { and, eq, isNull } from 'drizzle-orm';
import {
  branches,
  brands,
  organizations,
  cities,
  currentRoomTypes as roomTypes,
  rooms,
} from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
import { publicListingCondition } from './query.js';
import { publishedRoomPhoto } from './selectable-media.js';
export async function requirePublicInventoryBranch(database: Transaction, branchId: string) {
  const [branch] = await database
    .select({ id: branches.id })
    .from(branches)
    .innerJoin(brands, eq(brands.id, branches.brandId))
    .innerJoin(organizations, eq(organizations.id, branches.organizationId))
    .innerJoin(cities, eq(cities.id, branches.cityId))
    .where(and(eq(branches.id, branchId), publicListingCondition()))
    .limit(1);
  if (!branch || branch.id !== branchId)
    throw new DomainError('NOT_FOUND', 404, 'Listing unavailable');
}
export async function requirePublicInventoryType(
  database: Transaction,
  branchId: string,
  typeId: string,
) {
  await requirePublicInventoryBranch(database, branchId);
  const [type] = await database
    .select()
    .from(roomTypes)
    .where(
      and(eq(roomTypes.branchId, branchId), eq(roomTypes.id, typeId), isNull(roomTypes.archivedAt)),
    )
    .limit(1);
  if (!type || type.id !== typeId || type.branchId !== branchId || type.archivedAt !== null)
    throw new DomainError('NOT_FOUND', 404, 'Room type unavailable');
  return type;
}
export async function requirePublicInventoryRoom(
  database: Transaction,
  branchId: string,
  roomId: string,
) {
  await requirePublicInventoryBranch(database, branchId);
  const [parent] = await database
    .select({
      roomId: rooms.id,
      branchId: rooms.branchId,
      roomTypeId: roomTypes.id,
      inventoryMode: roomTypes.inventoryMode,
    })
    .from(rooms)
    .innerJoin(
      roomTypes,
      and(eq(roomTypes.id, rooms.roomTypeId), eq(roomTypes.branchId, rooms.branchId)),
    )
    .where(
      and(
        eq(rooms.id, roomId),
        eq(rooms.branchId, branchId),
        eq(rooms.status, 'active'),
        isNull(rooms.archivedAt),
        isNull(roomTypes.archivedAt),
        // ROOM-003: a direct room ID cannot reveal beds of an unpublished room.
        publishedRoomPhoto(database, rooms.branchId, rooms.id),
      ),
    )
    .limit(1);
  if (!parent || parent.roomId !== roomId || parent.branchId !== branchId)
    throw new DomainError('NOT_FOUND', 404, 'Room unavailable');
  return parent;
}
