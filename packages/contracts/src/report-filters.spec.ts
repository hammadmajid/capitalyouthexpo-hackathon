import { expect, it } from 'vitest';
import { reportQuerySchema } from './insights.js';
import { reportTypeSchema } from './insights.js';
import { parseReportFilters, reportFilterPolicy } from './report-filters.js';

const id = '10000000-0000-4000-8000-000000000001';
it.each([
  { buildingId: id },
  { floorId: id },
  { roomId: id },
  { residentId: id },
  { status: 'active' },
  { buildingId: id, floorId: id, roomId: id, residentId: id, status: 'active' },
])('RPT-001 / AUD-010: validated report query retains supported common filters (%#)', (filter) => {
  const query = reportQuerySchema.parse({
    ...filter,
    from: '2026-06-01',
    to: '2026-06-26',
    format: 'csv',
  });
  expect(query).toMatchObject(filter);
  expect(query).toMatchObject({ from: '2026-06-01', to: '2026-06-26', format: 'csv' });
});
it.each([
  { buildingId: 'not-a-uuid' },
  { floorId: 'not-a-uuid' },
  { roomId: 'not-a-uuid' },
  { residentId: 'not-a-uuid' },
  { status: 'invented_state' },
])('SEC-001 / RPT-001 / AUD-010: invalid filter values fail at the boundary (%#)', (filter) => {
  expect(reportQuerySchema.safeParse(filter).success).toBe(false);
});
it('RPT-001 / AUD-010: no-filter defaults retain the original validated query', () => {
  expect(reportQuerySchema.parse({})).toEqual({ format: 'json' });
});
it('RPT-001 / AUD-010: each actual report family has an explicit applicability policy', () => {
  expect(Object.keys(reportFilterPolicy).sort()).toEqual([...reportTypeSchema.options].sort());
});
it.each(reportTypeSchema.options)(
  'RPT-001 / AUD-010: %s accepts location filters and its real status vocabulary',
  (kind) => {
    expect(parseReportFilters(kind, { buildingId: id, floorId: id, roomId: id })).toEqual({
      buildingId: id,
      floorId: id,
      roomId: id,
    });
    for (const status of reportFilterPolicy[kind].statuses)
      expect(parseReportFilters(kind, { status })).toEqual({ status });
    expect(parseReportFilters(kind, {})).toEqual({});
  },
);
it.each([
  ['occupancy', { residentId: id }],
  ['bookings', { residentId: id }],
  ['bookings', { status: 'paid' }],
  ['residents', { status: 'overdue' }],
  ['payment-history', { status: 'paid' }],
  ['checkout-history', { status: 'active' }],
  ['complaints', { status: 'confirmed' }],
  ['transport-subscribers', { status: 'open' }],
] as const)(
  'RPT-001 / AUD-010: %s rejects inapplicable fields rather than ignoring them (%#)',
  (kind, filter) => {
    expect(() => parseReportFilters(kind, filter)).toThrowError(
      expect.objectContaining({ code: 'VALIDATION_FAILED', status: 400 }),
    );
  },
);
it.each([
  'residents',
  'rent-collection',
  'outstanding-dues',
  'payment-history',
  'security-deposits',
  'checkout-history',
  'complaints',
  'transport-subscribers',
] as const)('RPT-001 / AUD-010: %s accepts the exact resident relationship filter', (kind) => {
  expect(parseReportFilters(kind, { residentId: id })).toEqual({ residentId: id });
});
