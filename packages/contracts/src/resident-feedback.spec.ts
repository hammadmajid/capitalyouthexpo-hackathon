import { transportInvoiceState } from './resident-services.js';
import { expect, it } from 'vitest';
import {
  complaintInputSchema,
  isReviewEligible,
  nextComplaintStatus,
  reviewEligibleFrom,
  reviewInputSchema,
} from './resident-feedback.js';
import {
  menuUpdateInputSchema,
  transportDecisionInputSchema,
  transportRouteInputSchema,
} from './resident-services.js';
import { planTransportPeriod } from './transport-period.js';
const ratings = {
  cleanliness: 4,
  security: 5,
  food: 3,
  staff: 4,
  wifi: 2,
  facilities: 4,
  location: 5,
  value: 4,
  overall: 4,
};
it('CMP-004: resolved is not closed; only acceptance closes and reopen keeps going', () => {
  expect(nextComplaintStatus('open', 'assign')).toBe('assigned');
  expect(nextComplaintStatus('assigned', 'start')).toBe('in_progress');
  expect(nextComplaintStatus('in_progress', 'resolve')).toBe('resolved');
  expect(nextComplaintStatus('resolved', 'accept')).toBe('closed');
  expect(nextComplaintStatus('resolved', 'reopen')).toBe('reopened');
  expect(nextComplaintStatus('reopened', 'resolve')).toBe('resolved');
  expect(nextComplaintStatus('in_progress', 'note')).toBe('in_progress');
  expect(nextComplaintStatus('open', 'accept')).toBeNull();
  expect(nextComplaintStatus('closed', 'note')).toBeNull();
  expect(nextComplaintStatus('closed', 'reopen')).toBeNull();
});
it('CMP-002 / REV-004: approved categories and the 1..5 rating range are enforced', () => {
  expect(
    complaintInputSchema.parse({ category: 'geyser', title: 'Cold', description: 'No hot water' })
      .attachmentFileIds,
  ).toEqual([]);
  expect(
    complaintInputSchema.safeParse({ category: 'noise', title: 't', description: 'd' }).success,
  ).toBe(false);
  expect(reviewInputSchema.safeParse({ ratings }).success).toBe(true);
  expect(reviewInputSchema.safeParse({ ratings: { ...ratings, wifi: 6 } }).success).toBe(false);
  expect(reviewInputSchema.safeParse({ ratings: { ...ratings, overall: undefined } }).success).toBe(
    false,
  );
});
it('REV-002: eligible from 30 calendar days after check-in, inclusive', () => {
  expect(reviewEligibleFrom('2026-06-25')).toBe('2026-07-25');
  expect(isReviewEligible('2026-06-25', '2026-07-24')).toBe(false);
  expect(isReviewEligible('2026-06-25', '2026-07-25')).toBe(true);
  expect(isReviewEligible('2026-01-31', '2026-03-02')).toBe(true);
});
it('SERV-001/002: menu cells are unique; routes need times, stops and a price', () => {
  const cell = { dayOfWeek: 1, meal: 'lunch', description: 'Daal' };
  expect(menuUpdateInputSchema.safeParse({ expectedVersion: 0, items: [cell, cell] }).success).toBe(
    false,
  );
  expect(
    menuUpdateInputSchema.safeParse({ expectedVersion: 0, items: [{ ...cell, dayOfWeek: 8 }] })
      .success,
  ).toBe(false);
  const route = { name: 'R', monthlyChargePaisa: 1, departureTimes: ['07:30'], stops: ['A'] };
  expect(transportRouteInputSchema.safeParse(route).success).toBe(true);
  expect(transportRouteInputSchema.safeParse({ ...route, departureTimes: ['7:30'] }).success).toBe(
    false,
  );
  expect(transportRouteInputSchema.safeParse({ ...route, monthlyChargePaisa: 0 }).success).toBe(
    false,
  );
  expect(
    transportDecisionInputSchema.safeParse({ decision: 'reject', expectedVersion: 1, reason: '' })
      .success,
  ).toBe(false);
});
const terms = (proration: Record<string, unknown>, monthly = true) => ({
  policyVersionId: '10000000-0000-4000-8000-000000000001',
  currency: 'PKR',
  rentAmountPaisa: 1800000,
  depositPaisa: 0,
  fees: [],
  catalog: [],
  policy: {
    cycle: { kind: 'calendar_month', dueDay: 5 },
    proration: { kind: 'full_period' },
    graceDays: 0,
    lateCharge: { kind: 'disabled' },
    noticeDays: 15,
    earlyCheckout: { kind: 'manual' },
    allowOpenEnded: false,
    customCharges: 'disabled',
    ...(monthly
      ? {
          feeBilling: {
            oneTimeDueOffsetDays: 0,
            monthly: { cycle: { kind: 'calendar_month', dueDay: 5 }, proration },
          },
        }
      : {}),
  },
});
const stay = { moveInDate: '2026-06-25', expectedLeaveDate: '2026-10-25' };
const plan = (
  proration: Record<string, unknown>,
  windows: unknown[],
  periodIndex: number,
  monthly = true,
) => planTransportPeriod({ stay, terms: terms(proration, monthly), windows, periodIndex });
it('SERV-002 / P9-M5: transport charges only the covered days with the approved fee proration', () => {
  const daily = { kind: 'calendar_days', rounding: 'half_up' };
  const window = { from: '2026-07-10', to: '2026-08-20', chargePaisa: 310000 };
  expect(plan(daily, [window], 1)).toMatchObject({
    periodStart: '2026-07-01',
    amountPaisa: 220000n,
    dueDate: '2026-07-05',
  });
  expect(plan(daily, [window], 2)?.amountPaisa).toBe(190000n);
  expect(plan(daily, [window], 3)?.amountPaisa).toBe(0n);
  expect(plan({ kind: 'full_period' }, [window], 2)?.amountPaisa).toBe(310000n);
  expect(plan({ kind: 'manual' }, [window], 2)?.amountPaisa).toBeNull();
  expect(
    plan(daily, [window, { from: '2026-08-25', to: null, chargePaisa: 310000 }], 2)?.amountPaisa,
  ).toBe(260000n);
  expect(plan(daily, [], 9)).toBeNull();
  expect(() => plan(daily, [window], 1, false)).toThrow('monthly fee billing policy');
});

it('SERV-002: transport follows the rent due date while retaining its own proration', () => {
  const proration = { kind: 'calendar_days', rounding: 'half_up' };
  const agreed = terms(proration, false);
  const window = { from: '2026-07-10', to: '2026-09-01', chargePaisa: 310000 };
  const policy = {
    ...agreed.policy,
    transportBilling: { dueDay: 31, refundable: false, proration },
  };
  expect(
    planTransportPeriod({ stay, terms: { ...agreed, policy }, windows: [window], periodIndex: 1 }),
  ).toMatchObject({ dueDate: '2026-07-05', amountPaisa: 220000n });
  expect(plan(proration, [window], 1)?.dueDate).toBe('2026-07-05');
});
it('SERV-002: transport is due through its due date and only a settled receipt-backed balance is paid', () => {
  const bill = { state: 'due', dueDate: '2026-07-15', outstandingPaisa: 50000 };
  expect(transportInvoiceState(bill, '2026-07-15')).toBe('due');
  expect(transportInvoiceState(bill, '2026-07-16')).toBe('overdue');
  expect(transportInvoiceState({ ...bill, state: 'paid', outstandingPaisa: 0 }, '2026-07-16')).toBe(
    'paid',
  );
  expect(transportInvoiceState({ ...bill, outstandingPaisa: 0 }, '2026-07-16')).toBe('cleared');
});
