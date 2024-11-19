import { expect, it } from 'vitest';
import { visitHistoryPageSchema } from './visit-history.js';
const page = {
  visitId: '10000000-0000-4000-8000-000000000001',
  branchId: '10000000-0000-4000-8000-000000000002',
  branchName: 'Real hostel',
  customerName: 'Customer',
  data: [],
  nextCursor: null,
};
it('VISIT-001: strict private history requires human-readable scope and excludes actor identity', () => {
  expect(visitHistoryPageSchema.parse(page)).toEqual(page);
  expect(visitHistoryPageSchema.safeParse({ ...page, customerUserId: page.visitId }).success).toBe(
    false,
  );
  expect(visitHistoryPageSchema.safeParse({ ...page, branchName: '' }).success).toBe(false);
});
it('VISIT-001: history snapshots require matching state/proposal and approved action', () => {
  const entry = {
    id: page.visitId,
    action: 'request',
    status: 'requested',
    requestedStart: '2026-11-05T05:00:00Z',
    proposedStart: null,
    reason: null,
    createdAt: '2026-10-22T03:00:00Z',
  };
  expect(visitHistoryPageSchema.safeParse({ ...page, data: [entry] }).success).toBe(true);
  expect(
    visitHistoryPageSchema.safeParse({ ...page, data: [{ ...entry, status: 'rescheduled' }] })
      .success,
  ).toBe(false);
  expect(
    visitHistoryPageSchema.safeParse({ ...page, data: [{ ...entry, action: 'paid' }] }).success,
  ).toBe(false);
});
