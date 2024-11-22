import { bedDepositSql } from './bed-deposit.js';
import { and, eq, isNull, getTableColumns } from 'drizzle-orm';
import { bedRentSql } from './bed-price.js';
import { currentRoomTypes as roomTypes, roomTypeFees, rooms, seats } from '@hsm/db';
import { branchInventorySchema, money, moneyToJson } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
export async function readBranchInventory(
  database: Transaction,
  branchId: string,
  context: { permissions: string[]; canConfigureManagers: boolean },
  now = new Date(),
) {
  const types = await database
    .select()
    .from(roomTypes)
    .where(and(eq(roomTypes.branchId, branchId), isNull(roomTypes.archivedAt)))
    .orderBy(roomTypes.id);
  const fees = await database
    .select()
    .from(roomTypeFees)
    .where(eq(roomTypeFees.branchId, branchId))
    .orderBy(roomTypeFees.code, roomTypeFees.cadence);
  const physical = await database
    .select()
    .from(rooms)
    .where(and(eq(rooms.branchId, branchId), isNull(rooms.archivedAt)))
    .orderBy(rooms.id);
  const beds = await database
    .select({
      ...getTableColumns(seats),
      depositPaisa: bedDepositSql(database, seats.branchId, seats.id, roomTypes.depositPaisa, now),
      monthlyRentPaisa: bedRentSql(
        database,
        seats.branchId,
        seats.id,
        roomTypes.bedMonthlyRentPaisa,
        now,
      ),
    })
    .from(seats)
    .innerJoin(rooms, and(eq(rooms.id, seats.roomId), eq(rooms.branchId, seats.branchId)))
    .innerJoin(
      roomTypes,
      and(eq(roomTypes.id, rooms.roomTypeId), eq(roomTypes.branchId, rooms.branchId)),
    )
    .where(and(eq(seats.branchId, branchId), isNull(seats.archivedAt)))
    .orderBy(seats.ordinal);
  return branchInventorySchema.parse({
    ...context,
    roomTypes: types.map((type) => ({
      id: type.id,
      branchId,
      name: type.name,
      inventoryMode: type.inventoryMode,
      capacity: type.capacity,
      ...(type.setupManaged ? { setupManaged: true } : {}),
      bedMonthlyRentPaisa:
        type.bedMonthlyRentPaisa === null ? null : moneyToJson(money(type.bedMonthlyRentPaisa)),
      roomMonthlyRentPaisa:
        type.roomMonthlyRentPaisa === null ? null : moneyToJson(money(type.roomMonthlyRentPaisa)),
      depositPaisa: moneyToJson(money(type.depositPaisa)),
      archivedAt: type.archivedAt?.toISOString() ?? null,
      fees: type.priceVersionId
        ? type.priceFees
        : fees
            .filter((fee) => fee.roomTypeId === type.id)
            .map((fee) => ({
              code: fee.code,
              cadence: fee.cadence,
              amountPaisa: moneyToJson(money(fee.amountPaisa)),
            })),
    })),
    rooms: physical.map((room) => ({
      id: room.id,
      branchId,
      roomTypeId: room.roomTypeId,
      capacity: beds.filter((bed) => bed.roomId === room.id).length,
      label: room.label,
      status: room.status,
      archivedAt: room.archivedAt?.toISOString() ?? null,
      seats: beds
        .filter((bed) => bed.roomId === room.id)
        .map((bed) => ({
          id: bed.id,
          roomId: room.id,
          label: bed.label,
          ordinal: bed.ordinal,
          monthlyRentPaisa:
            bed.monthlyRentPaisa === null || bed.monthlyRentPaisa === undefined
              ? null
              : moneyToJson(money(bed.monthlyRentPaisa)),
          ...(bed.depositPaisa === undefined
            ? {}
            : { depositPaisa: moneyToJson(money(bed.depositPaisa)) }),
          status: bed.status,
          archivedAt: bed.archivedAt?.toISOString() ?? null,
        })),
    })),
  });
}
