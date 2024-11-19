import { expect, it } from 'vitest';
import type { BillingPolicy } from './billing-policy.js';
import { feeBillingPolicySchema } from './fee-billing-policy.js';
import { planAgreedFeePeriod } from './fee-period.js';
const feePolicy = {
  oneTimeDueOffsetDays: 2,
  monthly: {
    cycle: { kind: 'calendar_month', dueDay: 5 },
    proration: { kind: 'calendar_days', rounding: 'half_up' },
  },
} as const;
const policy: BillingPolicy = {
  cycle: { kind: 'week', dueOffsetDays: 2 },
  proration: { kind: 'full_period' },
  graceDays: 0,
  lateCharge: { kind: 'disabled' },
  noticeDays: 15,
  earlyCheckout: { kind: 'manual' },
  allowOpenEnded: true,
  customCharges: 'disabled',
  feeBilling: feePolicy,
};
function input(patch: Partial<BillingPolicy> = {}, index = 0) {
  return {
    stay: { moveInDate: '2028-01-15', expectedLeaveDate: '2028-04-01' as string | null },
    terms: {
      policyVersionId: '019a1234-1234-7123-8123-123456789abc',
      currency: 'PKR',
      rentAmountPaisa: 7000,
      depositPaisa: 1000,
      fees: [
        { code: 'mess', cadence: 'monthly', amountPaisa: 3101 },
        { code: 'utilities', cadence: 'one_time', amountPaisa: 777 },
      ],
      catalog: [],
      policy: { ...policy, ...patch },
    },
    fee: { code: 'mess', cadence: 'monthly' },
    periodIndex: index,
  };
}
it('RENT-003 / FIN-004: monthly fee retains monthly cadence and its exact disclosed amount despite weekly rent', () => {
  expect(planAgreedFeePeriod(input())).toEqual({
    code: 'mess',
    cadence: 'monthly',
    periodIndex: 0,
    periodStart: '2028-01-15',
    periodEnd: '2028-02-01',
    // CHG-052: the first fee is never due before move-in.
    dueDate: '2028-01-15',
    sourceKey: 'fee:mess:monthly:2028-01-15:2028-02-01',
    amountPaisa: 1701n,
  });
  expect(planAgreedFeePeriod(input({}, 1))).toMatchObject({
    periodStart: '2028-02-01',
    periodEnd: '2028-03-01',
    dueDate: '2028-02-05',
    amountPaisa: 3101n,
  });
});
it('RENT-003: explicit anniversary fee policy preserves original monthly anchors', () => {
  const value = input(
    {
      feeBilling: {
        ...feePolicy,
        monthly: { ...feePolicy.monthly, cycle: { kind: 'anniversary_month', dueOffsetDays: 2 } },
      },
    },
    1,
  );
  value.stay.moveInDate = '2028-01-31';
  expect(planAgreedFeePeriod(value)).toMatchObject({
    periodStart: '2028-02-29',
    periodEnd: '2028-03-31',
    dueDate: '2028-03-02',
    amountPaisa: 3101n,
  });
});
it('FIN-004: one-time fee has one immutable source and an explicitly configured due offset', () => {
  const value = {
    ...input({ feeBilling: { oneTimeDueOffsetDays: 2 } }),
    fee: { code: 'utilities', cadence: 'one_time' },
  };
  expect(planAgreedFeePeriod(value)).toEqual({
    code: 'utilities',
    cadence: 'one_time',
    periodIndex: 0,
    periodStart: null,
    periodEnd: null,
    dueDate: '2028-01-17',
    sourceKey: 'fee:utilities:one_time',
    amountPaisa: 777n,
  });
  expect(planAgreedFeePeriod({ ...value, periodIndex: 1 })).toBeNull();
});
it.each([0, 1])(
  'FIN-004: one-time period %i never accepts an undisclosed amount override',
  (periodIndex) => {
    expect(() =>
      planAgreedFeePeriod({
        ...input(),
        periodIndex,
        manualAmountPaisa: 1,
        fee: { code: 'utilities', cadence: 'one_time' },
      }),
    ).toThrow();
  },
);
it('FIN-004: missing billing timing is not guessed from rent timing or a universal date', () => {
  const value = input();
  delete value.terms.policy.feeBilling;
  expect(() => planAgreedFeePeriod(value)).toThrow('Explicit fee billing policy required');
  expect(() => planAgreedFeePeriod(input({ feeBilling: { oneTimeDueOffsetDays: 0 } }))).toThrow(
    'Explicit monthly fee policy required',
  );
});
it('FIN-004: a fee must match both category and cadence in the immutable disclosure', () => {
  expect(() =>
    planAgreedFeePeriod({ ...input(), fee: { code: 'admission', cadence: 'monthly' } }),
  ).toThrow('An exact disclosed fee is required');
  expect(() =>
    planAgreedFeePeriod({ ...input(), fee: { code: 'mess', cadence: 'one_time' } }),
  ).toThrow('An exact disclosed fee is required');
});
it('RENT-003: partial manual fee stays unresolved until an explicit valid amount, including zero', () => {
  const value = input({
    feeBilling: { ...feePolicy, monthly: { ...feePolicy.monthly, proration: { kind: 'manual' } } },
  });
  expect(planAgreedFeePeriod(value)?.amountPaisa).toBeNull();
  expect(planAgreedFeePeriod({ ...value, manualAmountPaisa: 123 })?.amountPaisa).toBe(123n);
  expect(planAgreedFeePeriod({ ...value, manualAmountPaisa: 0 })?.amountPaisa).toBe(0n);
});
it('FIN-004: full-period fee and zero disclosure are explicit values, never a payment claim', () => {
  const value = input({
    feeBilling: {
      ...feePolicy,
      monthly: { ...feePolicy.monthly, proration: { kind: 'full_period' } },
    },
  });
  expect(planAgreedFeePeriod(value)?.amountPaisa).toBe(3101n);
  value.terms.fees[0] = { code: 'mess', cadence: 'monthly', amountPaisa: 0 };
  expect(planAgreedFeePeriod(value)?.amountPaisa).toBe(0n);
  expect(() => planAgreedFeePeriod({ ...value, manualAmountPaisa: 1 })).toThrow();
});
it('RENT-003: finite fee coverage stops without inventing another rent period or checkout', () => {
  expect(planAgreedFeePeriod(input({}, 3))).toBeNull();
});
it.each([
  { cycle: { kind: 'week', dueOffsetDays: 0 } },
  { cycle: { kind: 'fixed_period', periodDays: 30, dueOffsetDays: 0 } },
  { cycle: { kind: 'term', dueOffsetDays: 0 } },
  { proration: { kind: 'fixed_first_period', amountPaisa: 123 } },
])('FIN-004: monthly fee policy rejects unsupported cadence/per-fee pricing %j', (patch) => {
  expect(
    feeBillingPolicySchema.safeParse({ ...feePolicy, monthly: { ...feePolicy.monthly, ...patch } })
      .success,
  ).toBe(false);
});
it.each([
  { ...feePolicy, oneTimeDueOffsetDays: -1 },
  { ...feePolicy, oneTimeDueOffsetDays: 1.1 },
  { ...feePolicy, oneTimeDueOffsetDays: Number.MAX_SAFE_INTEGER + 1 },
  { ...feePolicy, arbitraryChargePaisa: 100 },
])('FIN-004: invalid or arbitrary fee configuration %j is rejected', (value) => {
  expect(feeBillingPolicySchema.safeParse(value).success).toBe(false);
});
it.each([
  { periodIndex: -1 },
  { periodIndex: 1.1 },
  { manualAmountPaisa: 1.1 },
  { amountPaisa: 1 },
  { fee: { code: 'custom', cadence: 'monthly' } },
])('FIN-004: untrusted planning boundary %j cannot choose charge amounts/categories', (patch) => {
  expect(() => planAgreedFeePeriod({ ...input(), ...patch })).toThrow();
});
it.each([
  { allowOpenEnded: false } as Partial<BillingPolicy>,
  { cycle: { kind: 'term', dueOffsetDays: 0 } } as Partial<BillingPolicy>,
])('RENT-003: invalid open-ended agreement cannot be hidden by fee calculation', (patch) => {
  const value = input(patch);
  value.stay.expectedLeaveDate = null;
  expect(() => planAgreedFeePeriod(value)).toThrow();
});
it('FIN-004: unsupported one-time date arithmetic fails before any posting', () => {
  expect(() =>
    planAgreedFeePeriod({
      ...input({ feeBilling: { oneTimeDueOffsetDays: Number.MAX_SAFE_INTEGER } }),
      fee: { code: 'utilities', cadence: 'one_time' },
    }),
  ).toThrow(RangeError);
});
