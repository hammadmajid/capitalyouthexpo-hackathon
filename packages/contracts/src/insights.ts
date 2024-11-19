import { z } from 'zod';
import { databaseDateSchema } from './database-dates.js';
import { moneyJsonSchema } from './money.js';
import { stayIdentifierSchema as id } from './stay-values.js';
import { reportFilterFields } from './report-filters.js';
// RPT-002: export metadata does not add rows or change machine-readable CSV.
export const REPORT_TRUNCATED_HEADER = 'X-HSM-Report-Truncated';
export const reportTruncationHeaderSchema = z.enum(['true', 'false']);
const count = z.number().int().nonnegative();
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');
export const bedTotalsSchema = z
  .object({
    beds: count,
    occupied: count,
    available: count,
    reserved: count,
    blocked: count,
    unavailable: count,
  })
  .strict();
export const rentMonthSchema = z
  .object({
    month,
    invoices: count,
    expectedPaisa: moneyJsonSchema,
    collectedPaisa: moneyJsonSchema,
    outstandingPaisa: moneyJsonSchema,
    overdueInvoices: count,
  })
  .strict();
export const actionCountsSchema = z
  .object({
    pendingBookings: count,
    pendingProofs: count,
    openComplaints: count,
    upcomingCheckouts: count,
    overdueInvoices: count,
  })
  .strict();
// OWN-004: read-only, receipt-backed dashboard presentation; security is excluded.
export const ownerDashboardDetailsSchema = z
  .object({
    rentCollectedPaisa: moneyJsonSchema,
    transportCollectedPaisa: moneyJsonSchema,
    otherCollectedPaisa: moneyJsonSchema,
    overduePaisa: moneyJsonSchema,
    salaryDuePaisa: moneyJsonSchema,
    transportRequests: count,
    unreadMessages: count,
    trend: z.array(z.object({ month, collectedPaisa: moneyJsonSchema }).strict()).max(6),
  })
  .strict();
// OWN-001..004: per-branch rows from authoritative records; totals are their exact sums.
export const ownerBranchRowSchema = z
  .object({
    branchId: id,
    branchName: z.string(),
    verificationStatus: z.string(),
    beds: bedTotalsSchema,
    occupancyPercent: z.number().min(0).max(100),
    activeResidents: count,
    // OWN-002: confirmed bookings whose resident has not checked in yet.
    confirmedBookings: count.default(0),
    rent: rentMonthSchema,
    actions: actionCountsSchema,
    details: ownerDashboardDetailsSchema.optional(),
    subscription: z.literal('deferred'),
  })
  .strict();
export const ownerDashboardSchema = z
  .object({
    asOf: databaseDateSchema,
    month,
    branches: z.array(ownerBranchRowSchema).max(100),
    nextCursor: id.nullable().default(null),
    totals: z
      .object({
        details: ownerDashboardDetailsSchema.optional(),
        beds: bedTotalsSchema,
        activeResidents: count,
        confirmedBookings: count.default(0),
        rent: rentMonthSchema,
        actions: actionCountsSchema,
      })
      .strict(),
  })
  .strict();
export const dashboardQuerySchema = z
  .object({
    branchId: id.optional(),
    month: month.optional(),
    cursor: id.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(100),
  })
  .strict()
  .refine(
    (value) => !(value.branchId && value.cursor),
    'A selected branch cannot have a page cursor',
  );
// MGRD-001..005: assigned branch only; money appears only with the live finance_view grant.
export const managerDashboardSchema = z
  .object({
    branchId: id,
    asOf: databaseDateSchema,
    today: z.object({ moveIns: count, checkouts: count, visits: count }).strict(),
    queue: actionCountsSchema,
    beds: bedTotalsSchema,
    unreadNotices: count,
    rent: rentMonthSchema.nullable(),
  })
  .strict();
// RPT-001/002: report families; all values are strings so CSV/PDF output is exact.
export const reportTypeSchema = z.enum([
  'occupancy',
  'residents',
  'bookings',
  'rent-collection',
  'outstanding-dues',
  'payment-history',
  'security-deposits',
  'checkout-history',
  'complaints',
  'transport-subscribers',
]);
export type ReportType = z.infer<typeof reportTypeSchema>;
export const reportQuerySchema = z
  .object({
    ...reportFilterFields,
    from: databaseDateSchema.optional(),
    to: databaseDateSchema.optional(),
    branchIds: z
      .union([id, z.array(id).max(50)])
      .transform((value) => (Array.isArray(value) ? value : [value]))
      .optional(),
    format: z.enum(['json', 'csv', 'pdf']).default('json'),
  })
  .strict()
  .refine(
    (value) => !value.from || !value.to || value.from <= value.to,
    'From must be on or before to',
  );
export const reportSchema = z
  .object({
    type: reportTypeSchema,
    from: databaseDateSchema.nullable(),
    to: databaseDateSchema.nullable(),
    columns: z.array(z.string()).max(20),
    rows: z.array(z.array(z.string())).max(5000),
    truncated: z.boolean(),
  })
  .strict();
export type Report = z.infer<typeof reportSchema>;
// RPT-003/004: funnel from recorded booking facts; uncollected stages say so (no fabrication).
export const analyticsSchema = z
  .object({
    from: databaseDateSchema,
    to: databaseDateSchema,
    branches: z
      .array(
        z
          .object({
            branchId: id,
            branchName: z.string(),
            listingViews: z.null(),
            searches: z.null(),
            conversations: count,
            visitRequests: count,
            bookingRequests: count,
            confirmed: count,
            rejected: count,
            expired: count,
            checkedIn: count,
            averageResponseHours: z.number().nonnegative().nullable(),
            slowResponses: count,
            warnings: z.array(z.string()).max(5),
          })
          .strict(),
      )
      .max(100),
    coverage: z
      .object({ listingViews: z.literal('not_collected'), searches: z.literal('not_collected') })
      .strict(),
  })
  .strict();
export const analyticsQuerySchema = z
  .object({ from: databaseDateSchema, to: databaseDateSchema })
  .strict()
  .refine((value) => value.from <= value.to, 'From must be on or before to');
// RPT-002 / p.39: neutralize spreadsheet formulas and quote every cell.
export function csvCell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}
export function toCsv(report: Pick<Report, 'columns' | 'rows'>) {
  return (
    [report.columns, ...report.rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
  );
}
