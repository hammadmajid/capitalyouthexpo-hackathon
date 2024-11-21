import { expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { rooms, stays, residentPayments } from '@hsm/db';
import type { ReportFilters } from '@hsm/contracts';
import {
  hasReportLocation,
  paymentAssignmentBoundary,
  reportAssignmentPredicate,
  reportResidentPredicate,
  reportRoomPredicate,
  reportSnapshotPredicate,
  reportStatusPredicate,
} from './report-filter-predicates.js';
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const dialect = new PgDialect();
it('RPT-001 / AUD-010: absent filters add no predicates or implicit identity restriction', () => {
  expect(hasReportLocation({})).toBe(false);
  expect(reportRoomPredicate(rooms.branchId, rooms.id, {})).toBeUndefined();
  expect(reportAssignmentPredicate(stays.branchId, stays.id, {}, new Date())).toBeUndefined();
  expect(reportResidentPredicate(stays.branchId, stays.id)).toBeUndefined();
  expect(reportSnapshotPredicate(stays.branchId, stays.id, {}, '2026-06-28')).toBeUndefined();
  expect(reportStatusPredicate(stays.state)).toBeUndefined();
});
it.each<ReportFilters>([
  { roomId: id(1) },
  { floorId: id(2) },
  { buildingId: id(3) },
  { roomId: id(1), floorId: id(2), buildingId: id(3) },
])(
  'SEC-003 / AUD-010: location identifiers stay bound parameters with branch-correlated parents: %o',
  (filters) => {
    const predicate = reportRoomPredicate(rooms.branchId, rooms.id, filters);
    expect(predicate).toBeDefined();
    const query = dialect.sqlToQuery(sql`${predicate}`);
    for (const value of Object.values(filters)) {
      expect(query.params).toContain(value);
      expect(query.sql).not.toContain(value);
    }
    expect(query.sql).toContain('"rooms" "report_location_room"');
    expect(query.sql).toContain('"report_location_room"."branch_id" = "rooms"."branch_id"');
    expect(query.sql).toContain(
      '"report_location_floor"."branch_id" = "report_location_room"."branch_id"',
    );
  },
);
it('RES-005 / RPT-001 / AUD-010: snapshot binds resident and next Karachi midnight in one assignment existence predicate', () => {
  const predicate = reportSnapshotPredicate(
    stays.branchId,
    stays.id,
    { residentId: id(4), roomId: id(1) },
    '2024-02-29',
  );
  const query = dialect.sqlToQuery(sql`${predicate}`);
  expect(query.params).toContain(id(4));
  expect(query.params.filter((value) => value === '2024-02-29T19:00:00.000Z')).toHaveLength(2);
  expect(query.sql).toContain('"report_location_assignment"."stay_id" = "stays"."id"');
  expect(query.sql).toContain('"report_resident_stay"."branch_id" = "stays"."branch_id"');
  expect(query.sql).toContain('"report_location_assignment"."started_at" <');
  expect(query.sql).toContain('"report_location_assignment"."ended_at" >=');
});
it('RPT-001 / AUD-010: date-only payment selection uses the payment column and Karachi calendar, never current time', () => {
  const predicate = reportAssignmentPredicate(
    residentPayments.branchId,
    residentPayments.stayId,
    { roomId: id(1) },
    paymentAssignmentBoundary(residentPayments.paidOn),
  );
  const query = dialect.sqlToQuery(sql`${predicate}`);
  expect(query.sql).toContain('"resident_payments"."paid_on"::date + 1');
  expect(query.sql).toContain("at time zone 'Asia/Karachi'");
  expect(query.params).toEqual([id(1)]);
  expect(query.sql).not.toMatch(/now\(|current_timestamp/i);
  expect(dialect.sqlToQuery(sql`${reportStatusPredicate(stays.state, 'active')}`).params).toEqual([
    'active',
  ]);
});
