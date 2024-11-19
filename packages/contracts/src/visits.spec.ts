import { expect, it } from 'vitest';
import {
  createVisitInputSchema,
  visitCommandSchema,
  visitTimingSchema,
  visitingScheduleSchema,
} from './visits.js';
import {
  planVisitTransition,
  requireFutureVisitStart,
  visitStartIsWithinHours,
} from './visit-policy.js';
const hours = [{ dayOfWeek: 4, opensAt: '09:00', closesAt: '17:00' }];
const now = '2026-10-22T03:00:00Z';
const visit = { status: 'requested', requestedStart: '2026-10-22T05:00:00Z', proposedStart: null };
it.each([
  ['2026-10-22T03:59:59Z', false],
  ['2026-10-22T04:00:00Z', true],
  ['2026-10-22T11:59:59Z', true],
  ['2026-10-22T12:00:00Z', false],
  ['2026-10-23T05:00:00Z', false],
])('VISIT-001: Karachi window boundary %s', (start, expected) => {
  expect(visitStartIsWithinHours(start, hours)).toBe(expected);
});
it('VISIT-001: local weekday crosses the UTC date correctly', () => {
  expect(
    visitStartIsWithinHours('2026-10-21T20:00:00Z', [
      { dayOfWeek: 4, opensAt: '00:30', closesAt: '02:00' },
    ]),
  ).toBe(true);
  expect(visitStartIsWithinHours(visit.requestedStart, [])).toBe(false);
});
it.each(
  [
    [{ dayOfWeek: 7, opensAt: '09:00', closesAt: '17:00' }],
    [{ dayOfWeek: 4, opensAt: '17:00', closesAt: '09:00' }],
    [{ dayOfWeek: 4, opensAt: '09:00', closesAt: '09:00' }],
    [{ dayOfWeek: 4, opensAt: '24:00', closesAt: '25:00' }],
    [...hours, { dayOfWeek: 4, opensAt: '10:00', closesAt: '18:00' }],
    [hours[0], hours[0]],
  ].map((windows) => ({ windows })),
)('VISIT-001: rejects invalid or overlapping configuration %#', ({ windows }) => {
  expect(visitingScheduleSchema.safeParse(windows).success).toBe(false);
});
it('VISIT-001: adjacent windows and independent weekdays are valid without mutating input', () => {
  const windows = [
    { dayOfWeek: 5, opensAt: '09:00', closesAt: '17:00' },
    ...hours,
    { dayOfWeek: 4, opensAt: '17:00', closesAt: '18:00' },
  ];
  expect(visitingScheduleSchema.parse(windows)).toEqual(windows);
});
it.each([now, '2026-10-21T05:00:00Z', '2026-10-22T12:00:00Z'])(
  'VISIT-001: rejects unavailable start %s',
  (start) => {
    expect(() => requireFutureVisitStart(start, hours, now)).toThrow();
  },
);
it('VISIT-001: validates strict command boundaries without accepting actor injection', () => {
  expect(
    createVisitInputSchema.parse({
      branchId: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',
      requestedStart: visit.requestedStart,
    }).branchId,
  ).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  expect(
    createVisitInputSchema.safeParse({ branchId: 'bad', requestedStart: visit.requestedStart })
      .success,
  ).toBe(false);
  expect(
    createVisitInputSchema.safeParse({
      branchId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      requestedStart: visit.requestedStart,
      customerUserId: 'injected',
    }).success,
  ).toBe(false);
  expect(visitCommandSchema.safeParse({ action: 'reject', reason: ' ' }).success).toBe(false);
  expect(
    visitCommandSchema.safeParse({ action: 'approve', proposedStart: visit.requestedStart })
      .success,
  ).toBe(false);
  expect(
    visitTimingSchema.safeParse({ ...visit, proposedStart: visit.requestedStart }).success,
  ).toBe(false);
  expect(visitTimingSchema.safeParse({ ...visit, status: 'rescheduled' }).success).toBe(false);
});
it('VISIT-001: approval does not silently accept a reschedule', () => {
  expect(planVisitTransition(visit, { action: 'approve' }, hours, now).status).toBe('approved');
  expect(() =>
    planVisitTransition({ ...visit, status: 'approved' }, { action: 'approve' }, hours, now),
  ).toThrow();
  const proposed = planVisitTransition(
    visit,
    { action: 'reschedule', proposedStart: '2026-10-22T06:00:00Z' },
    hours,
    now,
  );
  expect(proposed.requestedStart).toBe(visit.requestedStart);
  expect(proposed.status).toBe('rescheduled');
  expect(() => planVisitTransition(proposed, { action: 'approve' }, hours, now)).toThrow();
  expect(planVisitTransition(proposed, { action: 'accept-reschedule' }, hours, now)).toEqual({
    status: 'approved',
    requestedStart: proposed.proposedStart,
    proposedStart: null,
  });
  expect(() => planVisitTransition(proposed, { action: 'accept-reschedule' }, [], now)).toThrow();
});
it.each(['cancel', 'reject'] as const)('VISIT-001: %s clears proposed time', (action) => {
  const proposed = { ...visit, status: 'rescheduled', proposedStart: '2026-10-22T06:00:00Z' };
  expect(
    planVisitTransition(
      proposed,
      action === 'reject' ? { action, reason: 'Unavailable' } : { action },
      hours,
      now,
    ),
  ).toEqual({ ...visit, status: action === 'cancel' ? 'cancelled' : 'rejected' });
});
it.each(['complete', 'no-show'] as const)(
  'VISIT-001: %s requires approval and arrival time',
  (action) => {
    const approved = { ...visit, status: 'approved' };
    expect(() => planVisitTransition(visit, { action }, hours, now)).toThrow();
    expect(() => planVisitTransition(approved, { action }, hours, now)).toThrow();
    expect(planVisitTransition(approved, { action }, hours, visit.requestedStart).status).toBe(
      action === 'complete' ? 'completed' : 'no_show',
    );
  },
);
it.each(['rejected', 'cancelled', 'completed', 'no_show'])(
  'VISIT-001: terminal state %s cannot reopen',
  (status) => {
    expect(() =>
      planVisitTransition({ ...visit, status }, { action: 'cancel' }, hours, now),
    ).toThrow();
  },
);
it('VISIT-001: refuses missing proposals, unchanged times and invalid instants', () => {
  expect(() => planVisitTransition(visit, { action: 'accept-reschedule' }, hours, now)).toThrow();
  expect(() =>
    planVisitTransition(
      visit,
      { action: 'reschedule', proposedStart: visit.requestedStart },
      hours,
      now,
    ),
  ).toThrow();
  expect(() => visitStartIsWithinHours('bad', hours)).toThrow();
  expect(() => requireFutureVisitStart(visit.requestedStart, hours, 'bad')).toThrow();
});
