import { bedDepositSql } from '../inventory/bed-deposit.js';
import { roomCapacity } from '../inventory/room-capacity.js';
import { and, eq, gt, getTableColumns, inArray, isNull, sql } from 'drizzle-orm';
import { minimumPublicBedRent, minimumPublicBedDeposit } from './bed-price-summary.js';
import { bedRentSql } from '../inventory/bed-price.js';
import { money, moneyToJson } from '@hsm/contracts';
import { currentRoomTypes as roomTypes, roomTypeFees, rooms, seats, type Database } from '@hsm/db';
import {
  publicInventoryTypePageSchema,
  publicInventoryRoomPageSchema,
  publicInventoryBedPageSchema,
  publicInventoryTypeSchema,
  publicInventoryRoomSchema,
  publicInventoryBedSchema,
  type PublicInventoryQuery,
} from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
import {
  inventoryPageRows,
  invalidInventoryPage,
  projectInventoryType,
  projectInventoryRoom,
  projectInventorySeat,
} from '../inventory/page-projection.js';
import {
  requirePublicInventoryBranch,
  requirePublicInventoryType,
  requirePublicInventoryRoom,
} from './public-page-scope.js';
import { publicOptionAvailability, publicWholeRoomOperational } from './discovery-inventory.js';
import { publicOwnRoomAmenities, publicRoomAmenities } from './room-amenities.js';
import { projectPublicPage } from './public-page-projection.js';
import { publishedBedPhoto, publishedPhotoIds, publishedRoomPhoto } from './selectable-media.js';
export class PublicInventoryPages {
  constructor(
    private readonly database: Database,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  types(branchId: string, query: PublicInventoryQuery) {
    return this.database.transaction(
      async (database) => {
        await requirePublicInventoryBranch(database, branchId);
        const rows = await database
          .select({
            id: roomTypes.id,
            branchId: roomTypes.branchId,
            name: roomTypes.name,
            inventoryMode: roomTypes.inventoryMode,
            capacity: roomTypes.capacity,
            setupManaged: roomTypes.setupManaged,
            bedMonthlyRentPaisa: minimumPublicBedRent(
              database,
              roomTypes.branchId,
              roomTypes.id,
              roomTypes.bedMonthlyRentPaisa,
              this.clock(),
            ),
            roomMonthlyRentPaisa: roomTypes.roomMonthlyRentPaisa,
            depositPaisa:
              sql<bigint>`case when ${roomTypes.inventoryMode} = 'per_bed' then ${minimumPublicBedDeposit(database, roomTypes.branchId, roomTypes.id, roomTypes.depositPaisa, this.clock())} else ${roomTypes.depositPaisa} end`.mapWith(
                (value: unknown) => BigInt(String(value)),
              ),
            createdAt: roomTypes.createdAt,
            updatedAt: roomTypes.updatedAt,
            archivedAt: roomTypes.archivedAt,
            priceVersionId: roomTypes.priceVersionId,
            priceFees: roomTypes.priceFees,
          })
          .from(roomTypes)
          .where(
            and(
              eq(roomTypes.branchId, branchId),
              isNull(roomTypes.archivedAt),
              gt(roomTypes.capacity, 0),
              query.cursor ? gt(roomTypes.id, query.cursor) : undefined,
            ),
          )
          .orderBy(roomTypes.id)
          .limit(query.limit + 1);
        inventoryPageRows(rows, query);
        if (rows.some((row) => row.branchId !== branchId || row.archivedAt !== null))
          return invalidInventoryPage();
        // BKG-003/005: public types disclose the same current fees that quotes charge.
        const ids = rows.map((row) => row.id);
        const fees = ids.length
          ? await database
              .select()
              .from(roomTypeFees)
              .where(
                and(eq(roomTypeFees.branchId, branchId), inArray(roomTypeFees.roomTypeId, ids)),
              )
              .orderBy(roomTypeFees.roomTypeId, roomTypeFees.code, roomTypeFees.cadence)
              .limit(ids.length * 32 + 1)
          : [];
        if (fees.length > ids.length * 32) return invalidInventoryPage();
        const amenities = await publicRoomAmenities(
          database,
          branchId,
          rows.map((row) => row.id),
        );
        const projected = rows.map((row) => {
          const value = projectInventoryType(
            row,
            fees.filter((fee) => fee.roomTypeId === row.id),
          );
          return projectPublicPage(publicInventoryTypeSchema, {
            id: value.id,
            name: value.name,
            capacity: value.capacity,
            inventoryMode: value.inventoryMode,
            bedMonthlyRentPaisa: value.bedMonthlyRentPaisa,
            roomMonthlyRentPaisa: value.roomMonthlyRentPaisa,
            depositPaisa: value.depositPaisa,
            fees: value.fees,
            amenities: amenities.get(value.id) ?? [],
          });
        });
        return projectPublicPage(publicInventoryTypePageSchema, {
          branchId,
          ...inventoryPageRows(projected, query),
        });
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  rooms(branchId: string, roomTypeId: string, query: PublicInventoryQuery) {
    return this.database.transaction(
      async (database) => {
        await requirePublicInventoryType(database, branchId, roomTypeId);
        const available = publicOptionAvailability(
          database,
          rooms.branchId,
          query,
          this.clock(),
          false,
          rooms.id,
        );
        const operational = publicWholeRoomOperational(database, rooms.branchId, rooms.id);
        const rows = await database
          .select({
            ...getTableColumns(rooms),
            capacity: roomCapacity(database, rooms.branchId, rooms.id),
            wholeRoomAvailable: sql<
              boolean | null
            >`case when ${roomTypes.inventoryMode} <> 'per_bed' and ${operational} then ${available} else false end`,
          })
          .from(rooms)
          .innerJoin(
            roomTypes,
            and(eq(roomTypes.id, rooms.roomTypeId), eq(roomTypes.branchId, rooms.branchId)),
          )
          .where(
            and(
              eq(rooms.branchId, branchId),
              eq(rooms.roomTypeId, roomTypeId),
              eq(rooms.status, 'active'),
              gt(roomCapacity(database, rooms.branchId, rooms.id), 0),
              isNull(rooms.archivedAt),
              isNull(roomTypes.archivedAt),
              // ROOM-003 / SEAT-002: rooms without a published room photo stay internal.
              publishedRoomPhoto(database, rooms.branchId, rooms.id),
              query.cursor ? gt(rooms.id, query.cursor) : undefined,
            ),
          )
          .orderBy(rooms.id)
          .limit(query.limit + 1);
        const photos = await publishedPhotoIds(database, branchId, {
          rooms: rows.map((row) => row.id),
        });
        const typeAmenities =
          (await publicRoomAmenities(database, branchId, [roomTypeId])).get(roomTypeId) ?? [];
        const own = await publicOwnRoomAmenities(
          database,
          branchId,
          rows.filter((row) => row.amenitiesCustomized).map((row) => row.id),
        );
        return this.roomPage(rows, branchId, roomTypeId, query, photos, (row) =>
          row.amenitiesCustomized ? (own.get(row.id) ?? []) : typeAmenities,
        );
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  private roomPage(
    rows: (typeof rooms.$inferSelect & { wholeRoomAvailable: boolean | null; capacity?: number })[],
    branchId: string,
    roomTypeId: string,
    query: PublicInventoryQuery,
    photos: Map<string, string[]>,
    amenitiesOf: (row: typeof rooms.$inferSelect) => { code: string; name: string }[],
  ) {
    if (
      rows.some(
        (row) =>
          row.branchId !== branchId ||
          row.roomTypeId !== roomTypeId ||
          row.archivedAt !== null ||
          row.status !== 'active' ||
          (query.moveInDate !== undefined && row.wholeRoomAvailable === null) ||
          (query.moveInDate === undefined && row.wholeRoomAvailable === true),
      )
    )
      return invalidInventoryPage();
    const projected = rows.map((row) => {
      const value = projectInventoryRoom(row);
      return projectPublicPage(publicInventoryRoomSchema, {
        id: value.id,
        label: value.label,
        wholeRoomAvailable: row.wholeRoomAvailable,
        ...(row.capacity === undefined ? {} : { capacity: row.capacity }),
        photoIds: photos.get(row.id) ?? [],
        amenities: amenitiesOf(row),
      });
    });
    return projectPublicPage(publicInventoryRoomPageSchema, {
      branchId,
      roomTypeId,
      ...inventoryPageRows(projected, query),
    });
  }
  beds(branchId: string, roomId: string, query: PublicInventoryQuery) {
    return this.database.transaction(
      async (database) => {
        const parent = await requirePublicInventoryRoom(database, branchId, roomId);
        const rows = await this.bedRows(
          database,
          branchId,
          roomId,
          query,
          parent.inventoryMode !== 'whole_room',
        );
        if (
          rows.some(
            (row) =>
              row.branchId !== branchId ||
              row.roomId !== roomId ||
              row.archivedAt !== null ||
              row.status !== 'active' ||
              (row.available === null) !== (query.moveInDate === undefined),
          )
        )
          return invalidInventoryPage();
        const photos = await publishedPhotoIds(database, branchId, {
          beds: rows.map((row) => row.id),
        });
        const projected = rows.map((row) => {
          const value = projectInventorySeat(row);
          return projectPublicPage(publicInventoryBedSchema, {
            id: value.id,
            label: value.label,
            available: row.available,
            monthlyRentPaisa:
              row.monthlyRentPaisa === null ? null : moneyToJson(money(row.monthlyRentPaisa)),
            ...(row.depositPaisa === undefined
              ? {}
              : { depositPaisa: moneyToJson(money(row.depositPaisa)) }),
            photoIds: photos.get(row.id) ?? [],
          });
        });
        return projectPublicPage(publicInventoryBedPageSchema, {
          branchId,
          roomId,
          ...inventoryPageRows(projected, query),
        });
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  private async bedRows(
    database: Transaction,
    branchId: string,
    roomId: string,
    query: PublicInventoryQuery,
    enabled: boolean,
  ) {
    if (!enabled) return [];
    const available = publicOptionAvailability(
      database,
      seats.branchId,
      query,
      this.clock(),
      true,
      seats.roomId,
      seats.id,
    );
    return database
      .select({
        ...getTableColumns(seats),
        available,
        depositPaisa: bedDepositSql(
          database,
          seats.branchId,
          seats.id,
          roomTypes.depositPaisa,
          this.clock(),
        ),
        monthlyRentPaisa: bedRentSql(
          database,
          seats.branchId,
          seats.id,
          roomTypes.bedMonthlyRentPaisa,
          this.clock(),
        ),
      })
      .from(seats)
      .innerJoin(rooms, and(eq(rooms.id, seats.roomId), eq(rooms.branchId, seats.branchId)))
      .innerJoin(
        roomTypes,
        and(eq(roomTypes.id, rooms.roomTypeId), eq(roomTypes.branchId, rooms.branchId)),
      )
      .where(
        and(
          eq(seats.branchId, branchId),
          eq(seats.roomId, roomId),
          eq(seats.status, 'active'),
          isNull(seats.archivedAt),
          publishedBedPhoto(database, seats.branchId, seats.roomId, seats.id),
          query.cursor ? gt(seats.id, query.cursor) : undefined,
        ),
      )
      .orderBy(seats.id)
      .limit(query.limit + 1);
  }
}
