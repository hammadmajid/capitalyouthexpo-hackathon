import { and, eq, exists, gte, isNull, lt, or, sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import { alias, QueryBuilder } from 'drizzle-orm/pg-core';
import { floors, rooms, stayAssignments, stays } from '@hsm/db';
import type { ReportFilters } from '@hsm/contracts';
import { reportEndExclusive } from './report-calendar.js';

const locationRoom = alias(rooms, 'report_location_room');
const locationFloor = alias(floors, 'report_location_floor');
const assignment = alias(stayAssignments, 'report_location_assignment');
const residentStay = alias(stays, 'report_resident_stay');
const queries = new QueryBuilder();
export const hasReportLocation = (f: ReportFilters) =>
  f.buildingId !== undefined || f.floorId !== undefined || f.roomId !== undefined;
// Family-specific status validation runs before this parameterized predicate.
export const reportStatusPredicate = (column: SQLWrapper, status?: string) =>
  status === undefined ? undefined : sql`${column} = ${status}`;

// RPT-001 / SEC-003: EXISTS retains one outer fact, including after multiple
// transfers, with an exact branch correlation at every parent relationship.
export function reportRoomPredicate(
  branch: SQLWrapper,
  room: SQLWrapper,
  f: ReportFilters,
): SQL | undefined {
  if (!hasReportLocation(f)) return undefined;
  return exists(
    queries
      .select({ one: sql`1` })
      .from(locationRoom)
      .leftJoin(
        locationFloor,
        and(
          eq(locationFloor.id, locationRoom.floorId),
          eq(locationFloor.branchId, locationRoom.branchId),
        ),
      )
      .where(
        and(
          eq(locationRoom.branchId, branch),
          eq(locationRoom.id, room),
          f.roomId ? eq(locationRoom.id, f.roomId) : undefined,
          f.floorId ? eq(locationRoom.floorId, f.floorId) : undefined,
          f.buildingId ? eq(locationFloor.buildingId, f.buildingId) : undefined,
        ),
      ),
  );
}
export function reportResidentPredicate(
  branch: SQLWrapper,
  stay: SQLWrapper,
  residentId?: string,
): SQL | undefined {
  if (!residentId) return undefined;
  return exists(
    queries
      .select({ one: sql`1` })
      .from(residentStay)
      .where(
        and(
          eq(residentStay.branchId, branch),
          eq(residentStay.id, stay),
          eq(residentStay.residentId, residentId),
        ),
      ),
  );
}
// ADR0079: just before the boundary. An assignment ending exactly at the
// boundary is retained; one starting at that instant belongs to the next period.
export function reportAssignmentPredicate(
  branch: SQLWrapper,
  stay: SQLWrapper,
  f: ReportFilters,
  boundary: Date | SQL,
): SQL | undefined {
  if (!hasReportLocation(f)) return undefined;
  return exists(
    queries
      .select({ one: sql`1` })
      .from(assignment)
      .where(
        and(
          eq(assignment.branchId, branch),
          eq(assignment.stayId, stay),
          lt(assignment.startedAt, boundary),
          or(isNull(assignment.endedAt), gte(assignment.endedAt, boundary)),
          reportRoomPredicate(assignment.branchId, assignment.roomId, f),
        ),
      ),
  );
}
export function reportSnapshotPredicate(
  branch: SQLWrapper,
  stay: SQLWrapper,
  f: ReportFilters,
  on: string,
) {
  return and(
    reportResidentPredicate(branch, stay, f.residentId),
    reportAssignmentPredicate(branch, stay, f, reportEndExclusive(on)),
  );
}
// paid_on has no timestamp. Resolve its assignment at the end of that Karachi
// calendar day, consistently for every payment on that date. Do not fabricate time.
export const paymentAssignmentBoundary = (paidOn: SQLWrapper) =>
  sql`((${paidOn}::date + 1)::timestamp at time zone 'Asia/Karachi')`;
