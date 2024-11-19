import { z } from 'zod';
import { bookingSummarySchema } from './booking-http.js';
import { invoiceFinancialStateSchema } from './finance-balances.js';
import { bedOccupancyStateSchema } from './occupancy.js';
import { complaintStatusSchema } from './resident-feedback.js';
import { transportSubscriptionStatusSchema } from './resident-services.js';
import { stayIdentifierSchema, stayStateSchema } from './stay-values.js';
import { DomainError } from './errors.js';
import type { ReportType } from './insights.js';

// RPT-001 / AUD-010: reuse operational state vocabularies. The report-specific
// policy below prevents a valid state from being silently ignored by another family.
export const reportFilterStatusSchema = z.union([
  bookingSummarySchema.shape.state,
  invoiceFinancialStateSchema,
  bedOccupancyStateSchema,
  complaintStatusSchema,
  transportSubscriptionStatusSchema,
  stayStateSchema,
]);
export const reportFilterFields = {
  buildingId: stayIdentifierSchema.optional(),
  floorId: stayIdentifierSchema.optional(),
  roomId: stayIdentifierSchema.optional(),
  residentId: stayIdentifierSchema.optional(),
  status: reportFilterStatusSchema.optional(),
};
export const reportFiltersSchema = z.object(reportFilterFields).strict();
export type ReportFilters = z.infer<typeof reportFiltersSchema>;
type FilterPolicy = { resident: boolean; statuses: readonly string[] };
export const reportFilterPolicy: Readonly<Record<ReportType, FilterPolicy>> = {
  occupancy: { resident: false, statuses: bedOccupancyStateSchema.options },
  residents: { resident: true, statuses: stayStateSchema.options },
  bookings: { resident: false, statuses: bookingSummarySchema.shape.state.options },
  'rent-collection': {
    resident: true,
    statuses: invoiceFinancialStateSchema.options,
  },
  'outstanding-dues': {
    resident: true,
    statuses: invoiceFinancialStateSchema.options,
  },
  'payment-history': { resident: true, statuses: [] },
  'security-deposits': { resident: true, statuses: stayStateSchema.options },
  'checkout-history': {
    resident: true,
    statuses: ['completed', 'terminated', 'abandoned'],
  },
  complaints: { resident: true, statuses: complaintStatusSchema.options },
  'transport-subscribers': {
    resident: true,
    statuses: transportSubscriptionStatusSchema.options,
  },
};
// Identifier existence/branch/parent checks must still run inside live server
// authority. This only validates syntax and report-family applicability.
export function parseReportFilters(kind: ReportType, value: unknown): ReportFilters {
  const filters = reportFiltersSchema.parse(value);
  const policy = reportFilterPolicy[kind];
  if (
    !policy ||
    (!policy.resident && filters.residentId !== undefined) ||
    (filters.status !== undefined && !policy.statuses.includes(filters.status))
  )
    throw new DomainError(
      'VALIDATION_FAILED',
      400,
      'Selected filters are not applicable to this report',
    );
  return filters;
}
