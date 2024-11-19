import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  visitActionInputSchema,
  visitListQuerySchema,
  visitPageSchema,
  visitSlotsSchema,
  visitSummarySchema,
  saveVisitingHoursSchema,
} from './visit-http.js';
const visit = {
  id: randomUUID(),
  branchId: randomUUID(),
  status: 'requested',
  requestedStart: '2026-11-05T05:00:00Z',
  proposedStart: null,
  reason: null,
  createdAt: '2026-10-22T05:00:00Z',
  updatedAt: '2026-10-22T05:00:00Z',
};
it('VISIT-001: strict visit transport rejects identities, missing versions and inconsistent proposals', () => {
  expect(visitSummarySchema.parse(visit)).toEqual(visit);
  expect(visitSummarySchema.safeParse({ ...visit, customerUserId: randomUUID() }).success).toBe(
    false,
  );
  expect(visitSummarySchema.safeParse({ ...visit, status: 'rescheduled' }).success).toBe(false);
  expect(
    visitSummarySchema.safeParse({ ...visit, proposedStart: visit.requestedStart }).success,
  ).toBe(false);
  expect(visitActionInputSchema.safeParse({ command: { action: 'cancel' } }).success).toBe(false);
  expect(
    visitActionInputSchema.parse({
      expectedUpdatedAt: visit.updatedAt,
      command: { action: 'approve' },
    }).command.action,
  ).toBe('approve');
});
it.each([
  { limit: 0 },
  { limit: 101 },
  { date: '2026-02-30' },
  { status: 'paid' },
  { customerUserId: randomUUID() },
])('VISIT-001: rejects unbounded or injected list input %#', (query) => {
  expect(visitListQuerySchema.safeParse(query).success).toBe(false);
});
it('VISIT-001: hours version, selected date and bounded pagination are explicit', () => {
  expect(visitListQuerySchema.parse({}).limit).toBe(20);
  expect(
    visitPageSchema.parse({
      data: [{ ...visit, branchName: 'Hostel', customerName: 'Customer' }],
      nextCursor: null,
    }).data,
  ).toHaveLength(1);
  expect(saveVisitingHoursSchema.safeParse({ windows: [] }).success).toBe(false);
  expect(
    saveVisitingHoursSchema.parse({ expectedVersion: 'a'.repeat(64), windows: [] }).windows,
  ).toEqual([]);
  expect(
    visitSlotsSchema.parse({ branchId: visit.branchId, date: '2026-11-05', windows: [] }).windows,
  ).toEqual([]);
});

it('VISIT-001 / SEC-003: list labels are required only in private lists and cannot disclose account/contact fields', () => {
  const labeled = { ...visit, branchName: 'Hostel', customerName: 'Customer' };
  expect(visitPageSchema.safeParse({ data: [visit], nextCursor: null }).success).toBe(false);
  expect(visitPageSchema.parse({ data: [labeled], nextCursor: null }).data[0]).toEqual(labeled);
  for (const extra of [{ customerUserId: visit.id }, { email: 'private@example.test' }])
    expect(
      visitPageSchema.safeParse({ data: [{ ...labeled, ...extra }], nextCursor: null }).success,
    ).toBe(false);
  expect(visitSummarySchema.safeParse(labeled).success).toBe(false);
});
