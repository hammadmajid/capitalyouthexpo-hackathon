import { and, asc, eq, gt, ilike, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { buildings, floors, residents, rooms } from '@hsm/db';
import {
  DomainError,
  inventoryPageSequenceIsValid,
  reportOptionPageSchema,
  type ReportOptionQuery,
  type ReportType,
} from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
import { authorizeReportFilters } from './report-filter-scope.js';
import { reportResidentOptionPredicate } from './report-option-residents.js';
type OptionRow = {
  id: string;
  branchId: string;
  name: string;
  detail: string | null;
  archivedAt: Date | null;
};
function where(
  branch: string,
  query: ReportOptionQuery,
  columns: { branch: AnyPgColumn; id: AnyPgColumn; name: AnyPgColumn },
  extra?: SQL,
) {
  const search = query.search?.replace(/[\\%_]/g, '\\$&');
  return and(
    eq(columns.branch, branch),
    query.cursor ? gt(columns.id, query.cursor) : undefined,
    search ? ilike(columns.name, '%' + search + '%') : undefined,
    extra,
  );
}
function buildingRows(tx: Transaction, branch: string, q: ReportOptionQuery) {
  return tx
    .select({
      id: buildings.id,
      branchId: buildings.branchId,
      name: buildings.name,
      detail: sql<null>`null`,
      archivedAt: buildings.archivedAt,
    })
    .from(buildings)
    .where(where(branch, q, { branch: buildings.branchId, id: buildings.id, name: buildings.name }))
    .orderBy(asc(buildings.id))
    .limit(q.limit + 1);
}
function floorRows(tx: Transaction, branch: string, q: ReportOptionQuery) {
  if (!q.buildingId) throw new DomainError('VALIDATION_FAILED', 400, 'Choose a building');
  return tx
    .select({
      id: floors.id,
      branchId: floors.branchId,
      name: floors.label,
      detail: sql<null>`null`,
      archivedAt: floors.archivedAt,
    })
    .from(floors)
    .where(
      where(
        branch,
        q,
        { branch: floors.branchId, id: floors.id, name: floors.label },
        eq(floors.buildingId, q.buildingId),
      ),
    )
    .orderBy(asc(floors.id))
    .limit(q.limit + 1);
}
function roomRows(tx: Transaction, branch: string, q: ReportOptionQuery) {
  return tx
    .select({
      id: rooms.id,
      branchId: rooms.branchId,
      name: rooms.label,
      detail: sql<
        string | null
      >`case when ${rooms.floorId} is null then null else ${buildings.name} || ' / ' || ${floors.label} end`,
      archivedAt: rooms.archivedAt,
    })
    .from(rooms)
    .leftJoin(floors, and(eq(floors.id, rooms.floorId), eq(floors.branchId, rooms.branchId)))
    .leftJoin(
      buildings,
      and(eq(buildings.id, floors.buildingId), eq(buildings.branchId, rooms.branchId)),
    )
    .where(
      where(
        branch,
        q,
        { branch: rooms.branchId, id: rooms.id, name: rooms.label },
        and(
          q.floorId ? eq(rooms.floorId, q.floorId) : undefined,
          q.buildingId ? eq(floors.buildingId, q.buildingId) : undefined,
        ),
      ),
    )
    .orderBy(asc(rooms.id))
    .limit(q.limit + 1);
}
function residentRows(tx: Transaction, branch: string, kind: ReportType, q: ReportOptionQuery) {
  return tx
    .select({
      id: residents.id,
      branchId: residents.branchId,
      name: residents.displayName,
      detail: sql<null>`null`,
      archivedAt: residents.archivedAt,
    })
    .from(residents)
    .where(
      where(
        branch,
        q,
        { branch: residents.branchId, id: residents.id, name: residents.displayName },
        reportResidentOptionPredicate(kind),
      ),
    )
    .orderBy(asc(residents.id))
    .limit(q.limit + 1);
}
export async function reportOptionsPage(
  tx: Transaction,
  branch: string,
  kind: ReportType,
  q: ReportOptionQuery,
) {
  await authorizeReportFilters(tx, [branch], { buildingId: q.buildingId, floorId: q.floorId });
  const rows: OptionRow[] =
    q.field === 'building'
      ? await buildingRows(tx, branch, q)
      : q.field === 'floor'
        ? await floorRows(tx, branch, q)
        : q.field === 'room'
          ? await roomRows(tx, branch, q)
          : await residentRows(tx, branch, kind, q);
  if (
    rows.length > q.limit + 1 ||
    !inventoryPageSequenceIsValid(rows, q.cursor) ||
    rows.some((row) => row.branchId !== branch)
  )
    throw new DomainError('INTERNAL', 500, 'Report options unavailable');
  const selected = rows.slice(0, q.limit);
  return reportOptionPageSchema.parse({
    branchId: branch,
    type: kind,
    field: q.field,
    buildingId: q.buildingId ?? null,
    floorId: q.floorId ?? null,
    data: selected.map((row) => ({
      id: row.id,
      name: row.name,
      detail: row.detail,
      archived: row.archivedAt !== null,
    })),
    nextCursor: rows.length > q.limit ? (selected.at(-1)?.id ?? null) : null,
  });
}
