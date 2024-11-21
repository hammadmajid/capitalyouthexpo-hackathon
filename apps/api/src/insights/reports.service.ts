import { eq } from 'drizzle-orm';
import { branches, type Database } from '@hsm/db';
import {
  DomainError,
  reportQuerySchema,
  reportOptionQuerySchema,
  reportSchema,
  reportTypeSchema,
  stayIdentifierSchema,
  toCsv,
  parseReportFilters,
  type InventoryPermission,
  type Report,
  type ReportType,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { karachiToday } from '../services/dates.js';
import { lockStaffScope } from '../services/scope.js';
import { reportOwnedBranchIds } from './report-owner-scope.js';
import { authorizeReportFilters } from './report-filter-scope.js';
import { reportOptionsPage } from './report-options.repository.js';
import {
  ROW_LIMIT,
  bookingsReport,
  complaintsReport,
  occupancyReport,
  residentsReport,
  transportReport,
  type Table,
  type Window,
} from './reports-operational.js';
import {
  checkoutsReport,
  depositsReport,
  outstandingReport,
  paymentsReport,
  rentCollectionReport,
} from './reports-financial.js';
import { renderReportPdf } from './report-pdf.js';
const FINANCIAL: ReportType[] = [
  'rent-collection',
  'outstanding-dues',
  'payment-history',
  'security-deposits',
  'checkout-history',
];
const run: Record<ReportType, (tx: Transaction, ids: string[], w: Window) => Promise<Table>> = {
  occupancy: occupancyReport,
  residents: residentsReport,
  bookings: bookingsReport,
  complaints: complaintsReport,
  'transport-subscribers': transportReport,
  'rent-collection': rentCollectionReport,
  'outstanding-dues': outstandingReport,
  'payment-history': paymentsReport,
  'security-deposits': depositsReport,
  'checkout-history': checkoutsReport,
};
export type ReportFile = {
  report: Report;
  body: string | Buffer;
  contentType: string;
  filename: string;
};
// RPT-001/002 / OWN-004: reports read the same authoritative tables as operational screens,
// scoped in the query itself (never filtered in the browser), bounded, and audited.
export class ReportService {
  constructor(
    private readonly database: Database,
    private readonly clock: () => Date = () => new Date(),
    private readonly audit = new AuditWriter(),
  ) {}
  async owner(actor: Actor, type: unknown, query: unknown) {
    const kind = reportTypeSchema.parse(type),
      input = reportQuerySchema.parse(query);
    return this.database.transaction(async (tx) => {
      await lockActor(tx, actor, this.clock);
      const requested = input.branchIds === undefined ? undefined : [...new Set(input.branchIds)];
      const owned = await reportOwnedBranchIds(tx, actor, requested);
      const ids = requested ?? owned;
      if (ids.some((value) => !owned.includes(value)))
        throw new DomainError('NOT_FOUND', 404, 'Branch unavailable');
      return this.build(tx, actor, kind, input, ids, 'owner');
    });
  }
  async branch(actor: Actor, branchId: unknown, type: unknown, query: unknown) {
    const branch = stayIdentifierSchema.parse(branchId),
      kind = reportTypeSchema.parse(type),
      input = reportQuerySchema.parse(query);
    if (input.branchIds && input.branchIds.some((value) => value !== branch))
      throw new DomainError('NOT_FOUND', 404, 'Branch unavailable');
    const grants: InventoryPermission[] = FINANCIAL.includes(kind)
      ? ['finance_view']
      : ['stay_manage'];
    return this.database.transaction(async (tx) => {
      const scope = await lockStaffScope(tx, actor, branch, grants, this.clock);
      return this.build(tx, actor, kind, input, [branch], scope.actorRole);
    });
  }
  async options(actor: Actor, branchId: unknown, type: unknown, query: unknown) {
    const branch = stayIdentifierSchema.parse(branchId),
      kind = reportTypeSchema.parse(type),
      input = reportOptionQuerySchema.parse(query);
    return this.database.transaction(async (tx) => {
      await lockStaffScope(
        tx,
        actor,
        branch,
        FINANCIAL.includes(kind) ? ['finance_view'] : ['stay_manage'],
        this.clock,
      );
      const page = await reportOptionsPage(tx, branch, kind, input);
      await lockActor(tx, actor, this.clock);
      return page;
    });
  }
  private async build(
    tx: Transaction,
    actor: Actor,
    kind: ReportType,
    input: ReturnType<typeof reportQuerySchema.parse>,
    ids: string[],
    role: string,
  ): Promise<ReportFile> {
    const filters = parseReportFilters(kind, {
      buildingId: input.buildingId,
      floorId: input.floorId,
      roomId: input.roomId,
      residentId: input.residentId,
      status: input.status,
    });
    const filterBranch = await authorizeReportFilters(tx, ids, filters);
    const scopedIds = filterBranch === undefined ? ids : ids.filter((id) => id === filterBranch);
    const now = this.clock(),
      w: Window = {
        from: input.from ?? null,
        to: input.to ?? null,
        today: karachiToday(now),
        now,
        filters,
      };
    const table = scopedIds.length ? await run[kind](tx, scopedIds, w) : { columns: [], rows: [] };
    const report = reportSchema.parse({
      type: kind,
      from: w.from,
      to: w.to,
      columns: table.columns,
      rows: table.rows.slice(0, ROW_LIMIT),
      truncated: table.rows.length > ROW_LIMIT,
    });
    const [first] = scopedIds.length
      ? await tx
          .select({ organizationId: branches.organizationId })
          .from(branches)
          .where(eq(branches.id, scopedIds[0] ?? ''))
      : [];
    if (first)
      await this.audit.hostel(tx, {
        organizationId: first.organizationId,
        branchId: scopedIds.length === 1 ? (scopedIds[0] ?? null) : null,
        actorUserId: actor.userId,
        actorRole: role,
        action: 'report.exported',
        targetType: 'report',
        targetId: scopedIds[0] ?? actor.userId,
        after: {
          type: kind,
          format: input.format,
          from: w.from,
          to: w.to,
          branches: scopedIds.length,
          rows: report.rows.length,
        },
        createdAt: now,
      });
    const name = `hsm-${kind}-${w.today}`;
    if (input.format === 'csv')
      return {
        report,
        body: toCsv(report),
        contentType: 'text/csv; charset=utf-8',
        filename: name + '.csv',
      };
    if (input.format === 'pdf')
      return {
        report,
        body: renderReportPdf(report, 'HSM report: ' + kind),
        contentType: 'application/pdf',
        filename: name + '.pdf',
      };
    return {
      report,
      body: JSON.stringify(report),
      contentType: 'application/json',
      filename: name + '.json',
    };
  }
}
