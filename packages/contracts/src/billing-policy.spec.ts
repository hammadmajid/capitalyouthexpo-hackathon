import { expect, it } from 'vitest';
import { moneyFromJson, moneyToJson } from './money.js';
import {
  billingCycleSchema,
  billingPolicySchema,
  billingAgreementTermsSchema,
  rentProrationSchema,
  lateChargePolicySchema,
} from './billing-policy.js';
export const policyFixture = {
  cycle: { kind: 'calendar_month', dueDay: 5 },
  proration: { kind: 'full_period' },
  graceDays: 3,
  lateCharge: { kind: 'disabled' },
  noticeDays: 15,
  earlyCheckout: { kind: 'manual' },
  allowOpenEnded: false,
  customCharges: 'catalog_only',
};
it.each([
  { kind: 'calendar_month', dueDay: 31 },
  { kind: 'anniversary_month', dueOffsetDays: 0 },
  { kind: 'week', dueOffsetDays: 6 },
  { kind: 'fixed_period', periodDays: 10, dueOffsetDays: 9 },
  { kind: 'term', dueOffsetDays: 0 },
])('RENT-001 / P3-1: controlled cycle %j is valid', (cycle) => {
  expect(billingCycleSchema.parse(cycle)).toEqual(cycle);
});
it.each([
  { kind: 'calendar_month', dueDay: 0 },
  { kind: 'calendar_month', dueDay: 32 },
  { kind: 'week', dueOffsetDays: 7 },
  { kind: 'fixed_period', periodDays: 0, dueOffsetDays: 0 },
  { kind: 'fixed_period', periodDays: 7, dueOffsetDays: 7 },
  { kind: 'term' },
  { kind: 'cron', expression: '* * * * *' },
  { kind: 'anniversary_month', dueOffsetDays: 1.5 },
])('RENT-001: invalid or arbitrary cycle %j fails', (cycle) => {
  expect(billingCycleSchema.safeParse(cycle).success).toBe(false);
});
it.each([
  { kind: 'full_period' },
  { kind: 'calendar_days', rounding: 'half_up' },
  { kind: 'calendar_days', rounding: 'down' },
  { kind: 'calendar_days', rounding: 'up' },
  { kind: 'fixed_first_period', amountPaisa: 1234567 },
  { kind: 'manual' },
])('RENT-003 / Q3: proration %j is explicit', (value) => {
  expect(rentProrationSchema.parse(value)).toEqual(value);
});
it.each([
  {},
  { kind: 'calendar_days' },
  { kind: 'fixed_first_period', amountPaisa: -1 },
  { kind: 'fixed_first_period', amountPaisa: 1.5 },
])('RENT-003: missing/invalid policy %j is not guessed', (value) => {
  expect(rentProrationSchema.safeParse(value).success).toBe(false);
});
it.each([
  { kind: 'disabled' },
  { kind: 'manual' },
  { kind: 'fixed', amountPaisa: 5001 },
  { kind: 'percentage', basisPoints: 125, capPaisa: null },
  { kind: 'percentage', basisPoints: 125, capPaisa: 10000 },
])('FIN-002: disclosed late policy %j is controlled', (value) => {
  expect(lateChargePolicySchema.parse(value)).toEqual(value);
});
it.each([
  { kind: 'fixed', amountPaisa: 0 },
  { kind: 'percentage', basisPoints: 1.2, capPaisa: null },
  { kind: 'percentage', basisPoints: 100 },
  { kind: 'percentage', basisPoints: Number.MAX_SAFE_INTEGER + 1, capPaisa: null },
])('FIN-002: invalid money/rate %j fails', (value) => {
  expect(lateChargePolicySchema.safeParse(value).success).toBe(false);
});
it('RENT-003 / FIN-001: complete versioned terms serialize exact integer paisa', () => {
  const terms = billingAgreementTermsSchema.parse({
    policyVersionId: '019a1234-1234-7123-8123-123456789abc',
    currency: 'PKR',
    catalog: [],
    fees: [],
    rentAmountPaisa: 1800001,
    depositPaisa: 1500000,
    policy: policyFixture,
  });
  expect(JSON.parse(JSON.stringify(terms))).toEqual(terms);
  expect(moneyToJson(moneyFromJson(terms.rentAmountPaisa))).toBe(1800001);
  expect(billingPolicySchema.safeParse({}).success).toBe(false);
  expect(billingPolicySchema.safeParse({ ...policyFixture, graceDays: -1 }).success).toBe(false);
  expect(billingPolicySchema.safeParse({ ...policyFixture, bankVerified: true }).success).toBe(
    false,
  );
});

it('BKG-004/005 / RENT-003: agreement retains disclosed fees and uses existing duplicate/price validation', () => {
  const fee = { code: 'mess', cadence: 'monthly', amountPaisa: 500001 };
  const input = {
    policyVersionId: '019a1234-1234-7123-8123-123456789abc',
    currency: 'PKR',
    catalog: [],
    rentAmountPaisa: 1800001,
    depositPaisa: 0,
    fees: [fee],
    policy: policyFixture,
  };
  const parsed = billingAgreementTermsSchema.parse(input);
  expect(parsed.fees).toEqual([fee]);
  expect(billingAgreementTermsSchema.safeParse({ ...input, fees: [fee, fee] }).success).toBe(false);
  expect(
    billingAgreementTermsSchema.safeParse({ ...input, fees: [{ ...fee, code: 'hidden' }] }).success,
  ).toBe(false);
  expect(billingAgreementTermsSchema.safeParse({ ...input, currency: 'USD' }).success).toBe(false);
});
