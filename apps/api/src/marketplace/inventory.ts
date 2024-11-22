import { bedDepositSql } from '../inventory/bed-deposit.js';
import { pakistanToday } from '../booking/policy.js';
import { and, eq, gt, isNull, getTableColumns } from 'drizzle-orm';
import { bedRentSql } from '../inventory/bed-price.js';
import { currentRoomTypes as roomTypes, rooms, seats, inventoryClaims } from '@hsm/db';
import {
  inventoryIsAvailable,
  money,
  moneyToJson,
  type MarketplaceQuery,
  type InventoryConflict,
} from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
export async function publicInventory(
  database: Transaction,
  branchId: string,
  query: MarketplaceQuery,
  now: Date,
) {
  const types = await database
    .select()
    .from(roomTypes)
    .where(
      and(
        eq(roomTypes.branchId, branchId),
        isNull(roomTypes.archivedAt),
        gt(roomTypes.capacity, 0),
      ),
    )
    .orderBy(roomTypes.id);
  const physical = await database
    .select()
    .from(rooms)
    .where(and(eq(rooms.branchId, branchId), eq(rooms.status, 'active'), isNull(rooms.archivedAt)))
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
  const claims = query.moveInDate
    ? await database
        .select()
        .from(inventoryClaims)
        .where(and(eq(inventoryClaims.branchId, branchId), isNull(inventoryClaims.releasedAt)))
    : [];
  const today = pakistanToday(now);
  const range =
    query.moveInDate && query.moveOutDate
      ? { moveInDate: query.moveInDate, moveOutDate: query.moveOutDate }
      : undefined;
  const conflicts: InventoryConflict[] = range
    ? claims.map((claim) => ({
        target: claim.seatId
          ? { kind: 'bed', roomId: claim.roomId, bedId: claim.seatId }
          : { kind: 'room', roomId: claim.roomId },
        range: {
          moveInDate: claim.moveInDate,
          moveOutDate:
            claim.moveOutDate === null ||
            (claim.assignmentId &&
              (range.moveInDate <= today || claim.moveOutDate <= today) &&
              claim.moveOutDate <= range.moveInDate)
              ? range.moveOutDate
              : claim.moveOutDate,
        },
        state: claim.assignmentId
          ? 'active_stay'
          : claim.holdId
            ? 'hold'
            : claim.expiresAt
              ? 'pending_request'
              : 'confirmed',
        expiresAt: claim.expiresAt?.toISOString() ?? null,
        reservesInventory: true,
      }))
    : [];
  const prices: bigint[] = [];
  let availableBeds = 0,
    availableWholeRooms = 0;
  const typeBedRents = new Map<string, bigint>();
  const typeBedDeposits = new Map<string, bigint>();
  for (const bed of beds) {
    if (
      bed.status !== 'active' ||
      bed.monthlyRentPaisa === null ||
      bed.monthlyRentPaisa === undefined
    )
      continue;
    const room = physical.find((row) => row.id === bed.roomId);
    if (!room) continue;
    if (bed.depositPaisa !== undefined) {
      const previousDeposit = typeBedDeposits.get(room.roomTypeId);
      if (previousDeposit === undefined || bed.depositPaisa < previousDeposit)
        typeBedDeposits.set(room.roomTypeId, bed.depositPaisa);
    }
    const previous = typeBedRents.get(room.roomTypeId);
    if (previous === undefined || bed.monthlyRentPaisa < previous)
      typeBedRents.set(room.roomTypeId, bed.monthlyRentPaisa);
  }
  const rentJson = (amount: bigint | null) => (amount === null ? null : moneyToJson(money(amount)));
  const result = types.map((type) => ({
    id: type.id,
    name: type.name,
    capacity: type.capacity,
    inventoryMode: type.inventoryMode,
    bedMonthlyRentPaisa: rentJson(typeBedRents.get(type.id) ?? type.bedMonthlyRentPaisa),
    roomMonthlyRentPaisa:
      type.roomMonthlyRentPaisa === null ? null : moneyToJson(money(type.roomMonthlyRentPaisa)),
    depositPaisa: moneyToJson(
      money(
        type.inventoryMode === 'per_bed'
          ? (typeBedDeposits.get(type.id) ?? type.depositPaisa)
          : type.depositPaisa,
      ),
    ),
    rooms: physical
      .filter(
        (room) =>
          room.roomTypeId === type.id &&
          beds.some((bed) => bed.roomId === room.id) &&
          (query.capacity === undefined ||
            beds.filter((bed) => bed.roomId === room.id).length === query.capacity),
      )
      .map((room) => {
        const activeBeds = beds.filter((bed) => bed.roomId === room.id && bed.status === 'active');
        const wholeEnabled =
          type.inventoryMode !== 'per_bed' &&
          !beds.some((bed) => bed.roomId === room.id && bed.status !== 'active');
        const whole =
          wholeEnabled && range
            ? inventoryIsAvailable({ kind: 'room', roomId: room.id }, range, conflicts, now)
            : null;
        const roomPriceMatches =
          type.roomMonthlyRentPaisa !== null &&
          type.roomMonthlyRentPaisa >= BigInt(query.minimumRentPaisa ?? 0) &&
          type.roomMonthlyRentPaisa <= BigInt(query.maximumRentPaisa ?? Number.MAX_SAFE_INTEGER);
        const options =
          type.inventoryMode === 'whole_room'
            ? []
            : activeBeds.map((bed) => {
                const bedRent = bed.monthlyRentPaisa ?? type.bedMonthlyRentPaisa;
                const bedDeposit = bed.depositPaisa ?? type.depositPaisa;
                const bedPriceMatches =
                  bedRent !== null &&
                  bedRent >= BigInt(query.minimumRentPaisa ?? 0) &&
                  bedRent <= BigInt(query.maximumRentPaisa ?? Number.MAX_SAFE_INTEGER) &&
                  bedDeposit <= BigInt(query.maximumDepositPaisa ?? Number.MAX_SAFE_INTEGER);
                const available = range
                  ? inventoryIsAvailable(
                      { kind: 'bed', roomId: room.id, bedId: bed.id },
                      range,
                      conflicts,
                      now,
                    )
                  : null;
                if (available && bedPriceMatches) availableBeds += 1;
                if ((!query.availableOnly || available) && bedPriceMatches && bedRent !== null)
                  prices.push(bedRent);
                return {
                  id: bed.id,
                  label: bed.label,
                  available,
                  monthlyRentPaisa: bedRent === null ? null : moneyToJson(money(bedRent)),
                  depositPaisa: moneyToJson(money(bedDeposit)),
                };
              });
        if (whole && roomPriceMatches) availableWholeRooms += 1;
        if (
          wholeEnabled &&
          (!query.availableOnly || whole) &&
          roomPriceMatches &&
          type.roomMonthlyRentPaisa !== null
        )
          prices.push(type.roomMonthlyRentPaisa);
        return {
          id: room.id,
          label: room.label,
          capacity: beds.filter((bed) => bed.roomId === room.id).length,
          wholeRoomAvailable: wholeEnabled ? whole : false,
          beds: options,
        };
      }),
  }));
  const lowest = prices.reduce<bigint | null>(
    (value, price) => (value === null || price < value ? price : value),
    null,
  );
  return {
    roomTypes: result,
    priceFromPaisa: lowest === null ? null : moneyToJson(money(lowest)),
    availableBeds: range ? availableBeds : null,
    availableWholeRooms: range ? availableWholeRooms : null,
  };
}
