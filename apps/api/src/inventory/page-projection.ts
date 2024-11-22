import {
  DomainError,
  inventoryPageSequenceIsValid,
  money,
  moneyToJson,
  roomTypeSummarySchema,
  inventoryRoomRowSchema,
  seatSummarySchema,
  type InventoryPageQuery,
} from '@hsm/contracts';
import type { roomTypes, currentRoomTypes, roomTypeFees, rooms, seats } from '@hsm/db';
export function invalidInventoryPage(): never {
  throw new DomainError('INTERNAL', 500, 'Inventory page metadata is invalid');
}
function instant(value: Date | null) {
  if (value === null) return null;
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return invalidInventoryPage();
  return value.toISOString();
}
export function projectInventoryType(
  row: typeof roomTypes.$inferSelect | typeof currentRoomTypes.$inferSelect,
  fees: (typeof roomTypeFees.$inferSelect)[],
) {
  try {
    return roomTypeSummarySchema.parse({
      id: row.id,
      branchId: row.branchId,
      name: row.name,
      inventoryMode: row.inventoryMode,
      capacity: row.capacity,
      ...(row.setupManaged ? { setupManaged: true } : {}),
      bedMonthlyRentPaisa:
        row.bedMonthlyRentPaisa === null ? null : moneyToJson(money(row.bedMonthlyRentPaisa)),
      roomMonthlyRentPaisa:
        row.roomMonthlyRentPaisa === null ? null : moneyToJson(money(row.roomMonthlyRentPaisa)),
      depositPaisa: moneyToJson(money(row.depositPaisa)),
      archivedAt: instant(row.archivedAt),
      fees:
        'priceVersionId' in row && row.priceVersionId
          ? row.priceFees
          : fees.map((fee) => ({
              code: fee.code,
              cadence: fee.cadence,
              amountPaisa: moneyToJson(money(fee.amountPaisa)),
            })),
    });
  } catch {
    return invalidInventoryPage();
  }
}
export function projectInventoryRoom(row: typeof rooms.$inferSelect & { capacity?: number }) {
  const result = inventoryRoomRowSchema.safeParse({
    id: row.id,
    branchId: row.branchId,
    roomTypeId: row.roomTypeId,
    ...(row.capacity === undefined ? {} : { capacity: row.capacity }),
    label: row.label,
    status: row.status,
    archivedAt: instant(row.archivedAt),
  });
  return result.success ? result.data : invalidInventoryPage();
}
export function projectInventorySeat(
  row: typeof seats.$inferSelect & { monthlyRentPaisa?: bigint | null; depositPaisa?: bigint },
) {
  const result = seatSummarySchema.safeParse({
    id: row.id,
    roomId: row.roomId,
    label: row.label,
    ordinal: row.ordinal,
    ...(row.monthlyRentPaisa === undefined
      ? {}
      : {
          monthlyRentPaisa:
            row.monthlyRentPaisa === null ? null : moneyToJson(money(row.monthlyRentPaisa)),
        }),
    ...(row.depositPaisa === undefined
      ? {}
      : { depositPaisa: moneyToJson(money(row.depositPaisa)) }),
    status: row.status,
    archivedAt: instant(row.archivedAt),
  });
  return result.success ? result.data : invalidInventoryPage();
}
export function inventoryPageRows<T extends { id: string }>(rows: T[], query: InventoryPageQuery) {
  if (rows.length > query.limit + 1 || !inventoryPageSequenceIsValid(rows, query.cursor))
    return invalidInventoryPage();
  const data = rows.slice(0, query.limit);
  const last = data.at(-1);
  if (rows.length > query.limit && !last) return invalidInventoryPage();
  return { data, nextCursor: rows.length > query.limit ? (last?.id ?? null) : null };
}
