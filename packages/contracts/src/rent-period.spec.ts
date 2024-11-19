import { expect, it } from 'vitest';
import type { BillingPolicy } from './billing-policy.js';
import { planRentPeriod } from './rent-period.js';
const policy: BillingPolicy = {
  cycle: { kind: 'calendar_month', dueDay: 5 },
  proration: { kind: 'calendar_days', rounding: 'half_up' },
  graceDays: 0,
  lateCharge: { kind: 'disabled' },
  noticeDays: 15,
  earlyCheckout: { kind: 'manual' },
  allowOpenEnded: true,
  customCharges: 'disabled',
};
function input(
  patch: Partial<BillingPolicy> = {},
  start = '2028-01-15',
  end: string | null = '2028-05-01',
  index = 0,
  amount = 3101,
) {
  return {
    stay: { moveInDate: start, expectedLeaveDate: end },
    periodIndex: index,
    terms: {
      policyVersionId: '019a1234-1234-7123-8123-123456789abc',
      currency: 'PKR',
      fees: [],
      catalog: [],
      rentAmountPaisa: amount,
      depositPaisa: 0,
      policy: { ...policy, ...patch },
    },
  };
}
it.each([
  ['half_up', 1701n],
  ['down', 1700n],
  ['up', 1701n],
] as const)(
  'RENT-003 / FIN-001: January partial period has exact %s paisa rounding',
  (rounding, expected) => {
    const result = planRentPeriod(input({ proration: { kind: 'calendar_days', rounding } }));
    expect(result).toMatchObject({
      periodStart: '2028-01-15',
      periodEnd: '2028-02-01',
      // CHG-052: never due before the stay starts (the month's day 5 is before move-in).
      dueDate: '2028-01-15',
      amountPaisa: expected,
    });
  },
);
it.each([
  ['half_up', '2028-04-16', 1, 1n],
  ['half_up', '2028-04-17', 1, 0n],
  ['up', '2028-04-16', 2, 1n],
  ['down', '2028-04-16', 2, 1n],
  ['half_up', '2028-04-16', 2, 1n],
] as const)(
  'FIN-001: %s rounding at calendar fraction %s retains every paisa',
  (rounding, start, amount, expected) => {
    expect(
      planRentPeriod(
        input({ proration: { kind: 'calendar_days', rounding } }, start, '2028-05-01', 0, amount),
      )?.amountPaisa,
    ).toBe(expected);
  },
);
it.each([
  ['2028-02-01', '2028-02-29'],
  ['2027-02-01', '2027-02-28'],
  ['2100-02-01', '2100-02-28'],
  ['2000-02-01', '2000-02-29'],
  ['0000-02-01', '0000-02-29'],
])('RENT-001: configured day31 is clipped to the actual month end for %s', (start, dueDate) => {
  expect(
    planRentPeriod(input({ cycle: { kind: 'calendar_month', dueDay: 31 } }, start, null))?.dueDate,
  ).toBe(dueDate);
});
it.each([
  [1, '2028-02-29', '2028-03-31'],
  [2, '2028-03-31', '2028-04-30'],
] as const)(
  'RENT-001: anniversary month %i retains original day31 without drift',
  (index, periodStart, periodEnd) => {
    expect(
      planRentPeriod(
        input(
          { cycle: { kind: 'anniversary_month', dueOffsetDays: 0 } },
          '2028-01-31',
          null,
          index,
        ),
      ),
    ).toMatchObject({ periodStart, periodEnd, dueDate: periodStart, amountPaisa: 3101n });
  },
);
it.each([
  [{ kind: 'week', dueOffsetDays: 2 }, 1, '2028-01-08', '2028-01-15', '2028-01-10'],
  [
    { kind: 'fixed_period', periodDays: 10, dueOffsetDays: 4 },
    2,
    '2028-01-21',
    '2028-01-31',
    '2028-01-25',
  ],
  [{ kind: 'term', dueOffsetDays: 3 }, 0, '2028-01-01', '2028-02-15', '2028-01-04'],
] as const)(
  'RENT-001: explicit cycle %j uses its own agreed amount basis',
  (cycle, index, periodStart, periodEnd, dueDate) => {
    expect(planRentPeriod(input({ cycle }, '2028-01-01', '2028-02-15', index))).toMatchObject({
      periodStart,
      periodEnd,
      dueDate,
      amountPaisa: 3101n,
    });
  },
);
it('RENT-003: term has exactly one period and no guessed open end', () => {
  expect(
    planRentPeriod(
      input({ cycle: { kind: 'term', dueOffsetDays: 0 } }, '2028-01-01', '2028-02-15', 1),
    ),
  ).toBeNull();
  expect(() =>
    planRentPeriod(input({ cycle: { kind: 'term', dueOffsetDays: 0 } }, '2028-01-01', null)),
  ).toThrow();
});
it('RENT-003: finite stays stop at the expected end and do not create phantom subsequent rent', () => {
  expect(planRentPeriod(input({}, '2028-01-15', '2028-01-20'))).toMatchObject({
    periodEnd: '2028-01-20',
    amountPaisa: 500n,
  });
  expect(planRentPeriod(input({}, '2028-01-15', '2028-01-20', 1))).toBeNull();
  expect(planRentPeriod(input({}, '2028-01-15', '2028-01-20', Number.MAX_SAFE_INTEGER))).toBeNull();
});
it('RENT-003: full-period and fixed-first-period charges are explicit policy choices', () => {
  expect(planRentPeriod(input({ proration: { kind: 'full_period' } }))?.amountPaisa).toBe(3101n);
  const fixed = { kind: 'fixed_first_period', amountPaisa: 777 } as const;
  expect(planRentPeriod(input({ proration: fixed }))?.amountPaisa).toBe(777n);
  expect(
    planRentPeriod(input({ proration: fixed }, '2028-01-15', '2028-02-10', 1))?.amountPaisa,
  ).toBe(3101n);
});
it('RENT-003: manual partial proration stays unresolved until an explicit validated amount is supplied', () => {
  const value = input({ proration: { kind: 'manual' } });
  expect(planRentPeriod(value)?.amountPaisa).toBeNull();
  expect(planRentPeriod({ ...value, manualAmountPaisa: 123 })?.amountPaisa).toBe(123n);
  expect(planRentPeriod({ ...value, manualAmountPaisa: 0 })?.amountPaisa).toBe(0n);
  expect(planRentPeriod(input({ proration: { kind: 'manual' } }, '2028-01-01'))?.amountPaisa).toBe(
    3101n,
  );
});
it.each([input(), input({ proration: { kind: 'manual' } }, '2028-01-01')])(
  'FIN-001: manual override cannot rewrite an automatically priced/full period',
  (value) => {
    expect(() => planRentPeriod({ ...value, manualAmountPaisa: 1 })).toThrow();
  },
);
it('RENT-003: open-ended policy is required and only one requested period is planned', () => {
  expect(() => planRentPeriod(input({ allowOpenEnded: false }, '2028-01-01', null))).toThrow();
  expect(
    planRentPeriod(input({ cycle: { kind: 'week', dueOffsetDays: 0 } }, '2028-01-01', null, 2)),
  ).toMatchObject({ periodStart: '2028-01-15', periodEnd: '2028-01-22' });
});
it.each([
  input({}, '9999-12-01', null),
  input({ cycle: { kind: 'week', dueOffsetDays: 0 } }, '9999-12-30', null),
  input({}, '2028-01-01', null, Number.MAX_SAFE_INTEGER),
])(
  'RENT-003: unsupported date arithmetic fails before any schedule or charge is posted',
  (value) => {
    expect(() => planRentPeriod(value)).toThrow(RangeError);
  },
);
it.each([
  { ...input(), periodIndex: -1 },
  { ...input(), manualAmountPaisa: 1.1 },
  input({}, '2028-02-30'),
  input({}, '2028-01-15', '2028-01-14'),
  input({}, '2028-01-15', '2028-05-01', 0, Number.MAX_SAFE_INTEGER + 1),
])('FIN-001 / RENT-003: invalid calendar/money boundary %j is rejected', (value) => {
  expect(() => planRentPeriod(value)).toThrow();
});
it('CHG-052: a resident who moves in after the due day is first billed on the move-in day', () => {
  const day1 = { cycle: { kind: 'calendar_month', dueDay: 1 } } as const;
  expect(planRentPeriod(input(day1, '2026-11-17', null, 0))).toMatchObject({
    periodStart: '2026-11-17',
    dueDate: '2026-11-17',
  });
  // From the second month the agreed due day applies as normal.
  expect(planRentPeriod(input(day1, '2026-11-17', null, 1))?.dueDate).toBe('2026-12-01');
  // Moving in before the due day keeps the agreed day.
  expect(
    planRentPeriod(input({ cycle: { kind: 'calendar_month', dueDay: 20 } }, '2026-11-17', null, 0))
      ?.dueDate,
  ).toBe('2026-11-20');
});
