import { readBedLocation } from './bed-location.js';
import { readUpcomingClaims } from './bed-upcoming.js';
import { withOccupancyRent } from './occupancy-rent.js';
import { readBedHistory } from './bed-history.repository.js';
import type { BedHistoryQuery } from '@hsm/contracts';
import { and, asc, eq, gt, isNull, lte, or, type SQL } from 'drizzle-orm';
import {
  buildings,
  floors,
  inventoryClaims,
  residents,
  roomTypes,
  rooms,
  seats,
  stayAssignments,
  stays,
  type Database,
} from '@hsm/db';
import {
  DomainError,
  databaseDateSchema,
  type BedOccupancyState,
  type OccupancyQuery,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
import type { Transaction } from '../audit/writer.js';
import { projectOccupancy, type OccupancyClaimRow } from './occupancy-projection.js';
function karachiToday(now: Date) {
  return databaseDateSchema.parse(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now),
  );
}
// A live claim covering the date; an expired hold no longer reserves anything.
function coveringClaims(branchId: string, on: string, now: Date): SQL | undefined {
  return and(
    eq(inventoryClaims.branchId, branchId),
    isNull(inventoryClaims.releasedAt),
    lte(inventoryClaims.moveInDate, on),
    or(isNull(inventoryClaims.moveOutDate), gt(inventoryClaims.moveOutDate, on)),
    or(isNull(inventoryClaims.holdId), gt(inventoryClaims.expiresAt, now)),
  );
}
async function claimRows(tx: Transaction, branchId: string, on: string, now: Date, narrow?: SQL) {
  const rows = await tx
    .select({
      roomId: inventoryClaims.roomId,
      seatId: inventoryClaims.seatId,
      assignmentId: inventoryClaims.assignmentId,
      blockId: inventoryClaims.blockId,
      bookingId: inventoryClaims.bookingId,
      holdId: inventoryClaims.holdId,
      moveInDate: inventoryClaims.moveInDate,
      moveOutDate: inventoryClaims.moveOutDate,
      stayId: stays.id,
      displayName: residents.displayName,
    })
    .from(inventoryClaims)
    .leftJoin(
      stayAssignments,
      and(
        eq(stayAssignments.id, inventoryClaims.assignmentId),
        eq(stayAssignments.branchId, inventoryClaims.branchId),
      ),
    )
    .leftJoin(
      stays,
      and(eq(stays.id, stayAssignments.stayId), eq(stays.branchId, inventoryClaims.branchId)),
    )
    .leftJoin(
      residents,
      and(eq(residents.id, stays.residentId), eq(residents.branchId, stays.branchId)),
    )
    .where(and(coveringClaims(branchId, on, now), narrow));
  return rows.map((row): OccupancyClaimRow & { row: typeof row } => {
    if (row.assignmentId !== null && (row.stayId === null || row.displayName === null))
      throw new DomainError('INTERNAL', 500, 'Occupancy lineage unavailable');
    return {
      roomId: row.roomId,
      seatId: row.seatId,
      kind:
        row.assignmentId !== null ? 'assignment' : row.blockId !== null ? 'block' : 'reservation',
      occupant:
        row.assignmentId !== null && row.stayId !== null && row.displayName !== null
          ? { stayId: row.stayId, displayName: row.displayName }
          : null,
      row,
    };
  });
}
type Projected = ReturnType<typeof projectOccupancy>['rooms'];
// P5-M4: list filters narrow rooms and beds only; totals still describe the whole branch.
function filterRooms(projected: Projected, query: OccupancyQuery) {
  return projected
    .filter(
      (room) =>
        (query.roomTypeId === undefined || room.roomTypeId === query.roomTypeId) &&
        (query.roomId === undefined || room.id === query.roomId),
    )
    .map((room) =>
      query.state === undefined
        ? room
        : { ...room, beds: room.beds.filter((bed) => bed.state === query.state) },
    )
    .filter((room) => query.state === undefined || room.beds.length > 0);
}
function claimSource(row: { assignmentId: unknown; blockId: unknown; bookingId: unknown }) {
  if (row.assignmentId !== null) return 'assignment' as const;
  if (row.blockId !== null) return 'block' as const;
  return row.bookingId !== null ? ('booking' as const) : ('hold' as const);
}
export class OccupancyRepository {
  constructor(
    private readonly database: Database,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  // BED-001 / RES-004: authoritative bed state from live claims, read in one snapshot under
  // the live stay_manage grant (rechecked after the scope lock, as Stay reads do), because the result maps residents to beds.
  page(actor: Actor, branchId: string, query: OccupancyQuery) {
    return this.database.transaction(async (tx) => {
      const now = this.clock();
      await lockActor(tx, actor, this.clock);
      await lockInventoryScope(tx, actor, branchId, 'stay_manage');
      await lockActor(tx, actor, this.clock);
      const on = query.on ?? karachiToday(now);
      // Building and floor group the Bed Board; both are branch-scoped joins.
      const roomRows = await tx
        .select({
          id: rooms.id,
          label: rooms.label,
          roomTypeId: rooms.roomTypeId,
          status: rooms.status,
          building: { id: buildings.id, name: buildings.name },
          floor: { id: floors.id, label: floors.label, levelNumber: floors.levelNumber },
        })
        .from(rooms)
        .leftJoin(floors, and(eq(floors.id, rooms.floorId), eq(floors.branchId, branchId)))
        .leftJoin(
          buildings,
          and(eq(buildings.id, floors.buildingId), eq(buildings.branchId, branchId)),
        )
        .where(and(eq(rooms.branchId, branchId), isNull(rooms.archivedAt)))
        .orderBy(asc(rooms.id));
      const seatRows = await tx
        .select({
          id: seats.id,
          roomId: seats.roomId,
          label: seats.label,
          ordinal: seats.ordinal,
          status: seats.status,
        })
        .from(seats)
        .where(and(eq(seats.branchId, branchId), isNull(seats.archivedAt)));
      const { rooms: projected, totals } = projectOccupancy(
        roomRows,
        seatRows,
        await claimRows(tx, branchId, on, now),
      );
      const start = filterRooms(projected, query).filter(
        (room) => query.cursor === undefined || room.id > query.cursor,
      );
      const data = await withOccupancyRent(
        tx,
        actor,
        branchId,
        start.slice(0, query.limit),
        karachiToday(now),
        on,
      );
      return {
        branchId,
        on,
        totals,
        data,
        nextCursor: start.length > query.limit ? (data.at(-1)?.id ?? null) : null,
      };
    });
  }
  history(actor: Actor, branchId: string, bedId: string, query: BedHistoryQuery) {
    return readBedHistory(this.database, actor, branchId, bedId, query, this.clock);
  }
  // BED-002: one bed with every live claim covering it, under the same stay_manage scope.
  bed(actor: Actor, branchId: string, bedId: string, requested?: string) {
    return this.database.transaction(async (tx) => {
      const now = this.clock();
      await lockActor(tx, actor, this.clock);
      await lockInventoryScope(tx, actor, branchId, 'stay_manage');
      await lockActor(tx, actor, this.clock);
      const on = requested ?? karachiToday(now);
      const [row] = await tx
        .select({
          seat: {
            id: seats.id,
            roomId: seats.roomId,
            label: seats.label,
            ordinal: seats.ordinal,
            status: seats.status,
          },
          room: {
            id: rooms.id,
            label: rooms.label,
            roomTypeId: rooms.roomTypeId,
            status: rooms.status,
          },
          roomTypeName: roomTypes.name,
        })
        .from(seats)
        .innerJoin(rooms, and(eq(rooms.id, seats.roomId), eq(rooms.branchId, seats.branchId)))
        .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
        .where(
          and(
            eq(seats.branchId, branchId),
            eq(seats.id, bedId),
            isNull(seats.archivedAt),
            isNull(rooms.archivedAt),
          ),
        );
      if (!row) throw new DomainError('NOT_FOUND', 404, 'Bed unavailable');
      const claims = await claimRows(
        tx,
        branchId,
        on,
        now,
        and(
          eq(inventoryClaims.roomId, row.room.id),
          or(eq(inventoryClaims.seatId, bedId), isNull(inventoryClaims.seatId)),
        ),
      );
      const projected = projectOccupancy([row.room], [row.seat], claims).rooms[0]?.beds[0];
      if (!projected) throw new DomainError('INTERNAL', 500, 'Bed projection unavailable');
      const enriched = await withOccupancyRent(
        tx,
        actor,
        branchId,
        [{ ...row.room, beds: [projected] }],
        karachiToday(now),
        on,
      );
      return {
        branchId,
        on,
        room: { ...row.room, roomTypeName: row.roomTypeName },
        bed: enriched[0]?.beds[0] ?? projected,
        location: await readBedLocation(tx, branchId, row.room.id),
        upcoming: await readUpcomingClaims(tx, branchId, row.room.id, bedId, on, now),
        claims: claims.slice(0, 50).map((claim) => ({
          source: claimSource(claim.row),
          bookingId: claim.row.bookingId,
          stayId: claim.row.assignmentId !== null ? claim.row.stayId : null,
          moveInDate: claim.row.moveInDate,
          moveOutDate: claim.row.moveOutDate,
          wholeRoom: claim.seatId === null,
        })),
      };
    });
  }
}
// OWN-001 / MGRD-001: whole-branch bed totals on a date from the same live-claim projection
// the Bed Board uses (one definition, no separate counters).
export async function occupancyTotals(
  tx: Transaction,
  branchId: string,
  on: string,
  now: Date,
  filter?: { room: SQL | undefined; state: BedOccupancyState | undefined },
) {
  const roomRows = await tx
    .select({
      id: rooms.id,
      label: rooms.label,
      roomTypeId: rooms.roomTypeId,
      status: rooms.status,
    })
    .from(rooms)
    .where(and(eq(rooms.branchId, branchId), isNull(rooms.archivedAt), filter?.room));
  const seatRows = await tx
    .select({
      id: seats.id,
      roomId: seats.roomId,
      label: seats.label,
      ordinal: seats.ordinal,
      status: seats.status,
    })
    .from(seats)
    .where(and(eq(seats.branchId, branchId), isNull(seats.archivedAt)));
  return projectOccupancy(roomRows, seatRows, await claimRows(tx, branchId, on, now), filter?.state)
    .totals;
}
