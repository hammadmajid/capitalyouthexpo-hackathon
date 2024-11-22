import { bedDepositSql } from './bed-deposit.js';
import { roomCapacity } from './room-capacity.js';
import { bedRentSql } from './bed-price.js';
import { getTableColumns } from 'drizzle-orm';
import { and, eq, gt, inArray, isNull } from 'drizzle-orm';
import { roomTypes, currentRoomTypes, roomTypeFees, rooms, seats } from '@hsm/db';
import {
  DomainError,
  inventoryRoomTypePageSchema,
  inventoryRoomPageSchema,
  inventorySeatPageSchema,
  type InventoryAccess,
  type InventoryPageQuery,
} from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
import {
  invalidInventoryPage,
  inventoryPageRows,
  projectInventoryType,
  projectInventoryRoom,
  projectInventorySeat,
} from './page-projection.js';
export async function readInventoryTypePage(
  database: Transaction,
  access: InventoryAccess,
  query: InventoryPageQuery,
) {
  const rows = await database
    .select()
    .from(currentRoomTypes)
    .where(
      and(
        eq(currentRoomTypes.branchId, access.branchId),
        isNull(currentRoomTypes.archivedAt),
        query.cursor ? gt(currentRoomTypes.id, query.cursor) : undefined,
      ),
    )
    .orderBy(currentRoomTypes.id)
    .limit(query.limit + 1);
  if (
    rows.length > query.limit + 1 ||
    rows.some((row) => row.branchId !== access.branchId || row.archivedAt !== null)
  )
    return invalidInventoryPage();
  const ids = rows.map((row) => row.id);
  const fees = ids.length
    ? await database
        .select()
        .from(roomTypeFees)
        .where(
          and(eq(roomTypeFees.branchId, access.branchId), inArray(roomTypeFees.roomTypeId, ids)),
        )
        .orderBy(roomTypeFees.roomTypeId, roomTypeFees.code, roomTypeFees.cadence)
        .limit(ids.length * 32 + 1)
        .for('share')
    : [];
  if (
    fees.length > ids.length * 32 ||
    fees.some((fee) => fee.branchId !== access.branchId || !ids.includes(fee.roomTypeId))
  )
    return invalidInventoryPage();
  const projected = rows.map((row) =>
    projectInventoryType(
      row,
      fees.filter((fee) => fee.roomTypeId === row.id),
    ),
  );
  const result = inventoryRoomTypePageSchema.safeParse({
    ...access,
    ...inventoryPageRows(projected, query),
  });
  return result.success ? result.data : invalidInventoryPage();
}
async function requireType(database: Transaction, branchId: string, roomTypeId: string) {
  const [row] = await database
    .select({ id: roomTypes.id })
    .from(roomTypes)
    .where(
      and(
        eq(roomTypes.branchId, branchId),
        eq(roomTypes.id, roomTypeId),
        isNull(roomTypes.archivedAt),
      ),
    )
    .limit(1)
    .for('share');
  if (!row) throw new DomainError('NOT_FOUND', 404, 'Room type unavailable');
  if (row.id !== roomTypeId) return invalidInventoryPage();
}
async function requireRoom(database: Transaction, branchId: string, roomId: string) {
  const [row] = await database
    .select({ id: rooms.id })
    .from(rooms)
    .innerJoin(
      roomTypes,
      and(
        eq(roomTypes.id, rooms.roomTypeId),
        eq(roomTypes.branchId, rooms.branchId),
        isNull(roomTypes.archivedAt),
      ),
    )
    .where(and(eq(rooms.branchId, branchId), eq(rooms.id, roomId), isNull(rooms.archivedAt)))
    .limit(1)
    .for('share');
  if (!row) throw new DomainError('NOT_FOUND', 404, 'Room unavailable');
  if (row.id !== roomId) return invalidInventoryPage();
}
export async function readInventoryRoomPage(
  database: Transaction,
  access: InventoryAccess,
  roomTypeId: string,
  query: InventoryPageQuery,
) {
  await requireType(database, access.branchId, roomTypeId);
  const rows = await database
    .select({
      ...getTableColumns(rooms),
      capacity: roomCapacity(database, rooms.branchId, rooms.id),
    })
    .from(rooms)
    .where(
      and(
        eq(rooms.branchId, access.branchId),
        eq(rooms.roomTypeId, roomTypeId),
        isNull(rooms.archivedAt),
        query.cursor ? gt(rooms.id, query.cursor) : undefined,
      ),
    )
    .orderBy(rooms.id)
    .limit(query.limit + 1)
    .for('share');
  if (
    rows.some(
      (row) =>
        row.branchId !== access.branchId ||
        row.roomTypeId !== roomTypeId ||
        row.archivedAt !== null,
    )
  )
    return invalidInventoryPage();
  const projected = rows.map(projectInventoryRoom);
  const result = inventoryRoomPageSchema.safeParse({
    ...access,
    roomTypeId,
    ...inventoryPageRows(projected, query),
  });
  return result.success ? result.data : invalidInventoryPage();
}
export async function readInventorySeatPage(
  database: Transaction,
  access: InventoryAccess,
  roomId: string,
  query: InventoryPageQuery,
  now = new Date(),
) {
  await requireRoom(database, access.branchId, roomId);
  const rows = await database
    .select({
      ...getTableColumns(seats),
      depositPaisa: bedDepositSql(
        database,
        seats.branchId,
        seats.id,
        currentRoomTypes.depositPaisa,
        now,
      ),
      monthlyRentPaisa: bedRentSql(
        database,
        seats.branchId,
        seats.id,
        currentRoomTypes.bedMonthlyRentPaisa,
        now,
      ),
    })
    .from(seats)
    .innerJoin(rooms, and(eq(rooms.id, seats.roomId), eq(rooms.branchId, seats.branchId)))
    .innerJoin(
      currentRoomTypes,
      and(eq(currentRoomTypes.id, rooms.roomTypeId), eq(currentRoomTypes.branchId, rooms.branchId)),
    )
    .where(
      and(
        eq(seats.branchId, access.branchId),
        eq(seats.roomId, roomId),
        isNull(seats.archivedAt),
        query.cursor ? gt(seats.id, query.cursor) : undefined,
      ),
    )
    .orderBy(seats.id)
    .limit(query.limit + 1)
    .for('share', { of: seats });
  if (
    rows.some(
      (row) => row.branchId !== access.branchId || row.roomId !== roomId || row.archivedAt !== null,
    )
  )
    return invalidInventoryPage();
  const projected = rows.map(projectInventorySeat);
  const result = inventorySeatPageSchema.safeParse({
    ...access,
    roomId,
    ...inventoryPageRows(projected, query),
  });
  return result.success ? result.data : invalidInventoryPage();
}
