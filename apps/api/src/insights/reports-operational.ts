import { and, asc, eq, gte, inArray, isNull, isNotNull, lte, or, lt } from 'drizzle-orm';
import {
  bookings,
  branches,
  complaints,
  residents,
  rooms,
  seats,
  stayAssignments,
  stays,
  transportRoutes,
  transportSubscriptions,
} from '@hsm/db';
import type { Transaction } from '../audit/writer.js';
import { bedOccupancyStateSchema, type ReportFilters } from '@hsm/contracts';
import {
  reportRoomPredicate,
  reportResidentPredicate,
  reportSnapshotPredicate,
  reportStatusPredicate,
} from './report-filter-predicates.js';
import { occupancyTotals } from '../stay/occupancy.repository.js';
import { reportDay as day, reportStart as start, reportEndExclusive } from './report-calendar.js';
export const ROW_LIMIT = 5000;
export type Window = {
  from: string | null;
  to: string | null;
  today: string;
  now: Date;
  filters?: ReportFilters;
};
export type Table = { columns: string[]; rows: string[][] };
export const paisa = (value: bigint | number) => {
  const amount = BigInt(value),
    sign = amount < 0n ? '-' : '',
    abs = amount < 0n ? -amount : amount;
  return `${sign}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
};
export async function branchNames(tx: Transaction, ids: string[]) {
  const rows = await tx
    .select({ id: branches.id, name: branches.name })
    .from(branches)
    .where(inArray(branches.id, ids));
  return new Map(rows.map((row) => [row.id, row.name]));
}
// BED-001: bed states on the report's end date (or today) per branch.
export async function occupancyReport(tx: Transaction, ids: string[], w: Window): Promise<Table> {
  const names = await branchNames(tx, ids),
    on = w.to ?? w.today,
    rows: string[][] = [];
  for (const id of ids) {
    const f = w.filters;
    const t =
      f && Object.values(f).some((value) => value !== undefined)
        ? await occupancyTotals(tx, id, on, w.now, {
            room: reportRoomPredicate(rooms.branchId, rooms.id, f),
            state: f.status === undefined ? undefined : bedOccupancyStateSchema.parse(f.status),
          })
        : await occupancyTotals(tx, id, on, w.now);
    rows.push([
      names.get(id) ?? id,
      on,
      String(t.beds),
      String(t.occupied),
      String(t.available),
      String(t.reserved),
      String(t.blocked),
      t.beds ? ((t.occupied * 100) / t.beds).toFixed(1) : '0.0',
    ]);
  }
  return {
    columns: [
      'Branch',
      'Date',
      'Beds',
      'Occupied',
      'Available',
      'Reserved',
      'Blocked',
      'Occupancy %',
    ],
    rows,
  };
}
// Residents whose Stay overlapped the window (checked in by `to`, not closed before `from`).
export async function residentsReport(tx: Transaction, ids: string[], w: Window): Promise<Table> {
  const names = await branchNames(tx, ids);
  const rows = await tx
    .select({
      branchId: stays.branchId,
      name: residents.displayName,
      state: stays.state,
      moveIn: stays.moveInDate,
      leave: stays.expectedLeaveDate,
      closedAt: stays.closedAt,
      room: rooms.label,
      bed: seats.label,
    })
    .from(stays)
    .innerJoin(
      residents,
      and(eq(residents.id, stays.residentId), eq(residents.branchId, stays.branchId)),
    )
    .leftJoin(
      stayAssignments,
      and(
        eq(stayAssignments.stayId, stays.id),
        eq(stayAssignments.branchId, stays.branchId),
        lt(stayAssignments.startedAt, reportEndExclusive(w.to ?? w.today)),
        or(
          isNull(stayAssignments.endedAt),
          gte(stayAssignments.endedAt, reportEndExclusive(w.to ?? w.today)),
        ),
      ),
    )
    .leftJoin(rooms, eq(rooms.id, stayAssignments.roomId))
    .leftJoin(seats, eq(seats.id, stayAssignments.seatId))
    .where(
      and(
        inArray(stays.branchId, ids),
        reportSnapshotPredicate(stays.branchId, stays.id, w.filters ?? {}, w.to ?? w.today),
        reportStatusPredicate(stays.state, w.filters?.status),
        w.to ? lt(stays.checkedInAt, reportEndExclusive(w.to)) : undefined,
        w.from ? or(isNull(stays.closedAt), gte(stays.closedAt, start(w.from))) : undefined,
      ),
    )
    .orderBy(asc(stays.branchId), asc(residents.displayName))
    .limit(ROW_LIMIT + 1);
  return {
    columns: ['Branch', 'Resident', 'Status', 'Room', 'Bed', 'Move-in', 'Expected leave', 'Closed'],
    rows: rows.map((row) => [
      names.get(row.branchId) ?? '',
      row.name,
      row.state,
      row.room ?? '',
      row.bed ?? '',
      row.moveIn,
      row.leave ?? '',
      day(row.closedAt),
    ]),
  };
}
export async function bookingsReport(tx: Transaction, ids: string[], w: Window): Promise<Table> {
  const names = await branchNames(tx, ids);
  const rows = await tx
    .select({
      branchId: bookings.branchId,
      createdAt: bookings.createdAt,
      moveIn: bookings.moveInDate,
      moveOut: bookings.moveOutDate,
      state: bookings.state,
    })
    .from(bookings)
    .where(
      and(
        inArray(bookings.branchId, ids),
        reportRoomPredicate(bookings.branchId, bookings.roomId, w.filters ?? {}),
        reportStatusPredicate(bookings.state, w.filters?.status),
        w.from ? gte(bookings.createdAt, start(w.from)) : undefined,
        w.to ? lt(bookings.createdAt, reportEndExclusive(w.to)) : undefined,
      ),
    )
    .orderBy(asc(bookings.createdAt))
    .limit(ROW_LIMIT + 1);
  return {
    columns: ['Branch', 'Requested', 'Move-in', 'Move-out', 'State'],
    rows: rows.map((row) => [
      names.get(row.branchId) ?? '',
      day(row.createdAt),
      row.moveIn,
      row.moveOut,
      row.state,
    ]),
  };
}
export async function complaintsReport(tx: Transaction, ids: string[], w: Window): Promise<Table> {
  const names = await branchNames(tx, ids);
  const rows = await tx
    .select({
      branchId: complaints.branchId,
      createdAt: complaints.createdAt,
      category: complaints.category,
      status: complaints.status,
      title: complaints.title,
      resolvedAt: complaints.resolvedAt,
      reopenCount: complaints.reopenCount,
    })
    .from(complaints)
    .where(
      and(
        inArray(complaints.branchId, ids),
        reportRoomPredicate(complaints.branchId, complaints.roomId, w.filters ?? {}),
        reportResidentPredicate(complaints.branchId, complaints.stayId, w.filters?.residentId),
        reportStatusPredicate(complaints.status, w.filters?.status),
        w.from ? gte(complaints.createdAt, start(w.from)) : undefined,
        w.to ? lt(complaints.createdAt, reportEndExclusive(w.to)) : undefined,
      ),
    )
    .orderBy(asc(complaints.createdAt))
    .limit(ROW_LIMIT + 1);
  return {
    columns: ['Branch', 'Raised', 'Category', 'Status', 'Title', 'Resolved', 'Reopened'],
    rows: rows.map((row) => [
      names.get(row.branchId) ?? '',
      day(row.createdAt),
      row.category,
      row.status,
      row.title,
      day(row.resolvedAt),
      String(row.reopenCount),
    ]),
  };
}
export async function transportReport(tx: Transaction, ids: string[], w: Window): Promise<Table> {
  const names = await branchNames(tx, ids);
  const rows = await tx
    .select({
      branchId: transportSubscriptions.branchId,
      route: transportRoutes.name,
      resident: residents.displayName,
      status: transportSubscriptions.status,
      from: transportSubscriptions.effectiveFrom,
      to: transportSubscriptions.effectiveTo,
      charge: transportSubscriptions.monthlyChargePaisa,
    })
    .from(transportSubscriptions)
    .innerJoin(transportRoutes, eq(transportRoutes.id, transportSubscriptions.routeId))
    .innerJoin(stays, eq(stays.id, transportSubscriptions.stayId))
    .innerJoin(
      residents,
      and(eq(residents.id, stays.residentId), eq(residents.branchId, stays.branchId)),
    )
    .where(
      and(
        inArray(transportSubscriptions.branchId, ids),
        w.filters?.status === undefined
          ? inArray(transportSubscriptions.status, ['active', 'ended'])
          : reportStatusPredicate(transportSubscriptions.status, w.filters.status),
        reportSnapshotPredicate(
          transportSubscriptions.branchId,
          transportSubscriptions.stayId,
          w.filters ?? {},
          w.to ?? w.today,
        ),
        w.to
          ? or(
              lte(transportSubscriptions.effectiveFrom, w.to),
              and(
                isNull(transportSubscriptions.effectiveFrom),
                lt(transportSubscriptions.createdAt, reportEndExclusive(w.to)),
              ),
            )
          : undefined,
        w.from
          ? or(
              isNull(transportSubscriptions.effectiveTo),
              gte(transportSubscriptions.effectiveTo, w.from),
            )
          : undefined,
        w.from
          ? or(
              isNotNull(transportSubscriptions.effectiveFrom),
              gte(transportSubscriptions.createdAt, start(w.from)),
            )
          : undefined,
      ),
    )
    .orderBy(asc(transportRoutes.name))
    .limit(ROW_LIMIT + 1);
  return {
    columns: ['Branch', 'Route', 'Resident', 'Status', 'From', 'To', 'Monthly charge (PKR)'],
    rows: rows.map((row) => [
      names.get(row.branchId) ?? '',
      row.route,
      row.resident,
      row.status,
      row.from ?? '',
      row.to ?? '',
      paisa(row.charge),
    ]),
  };
}
