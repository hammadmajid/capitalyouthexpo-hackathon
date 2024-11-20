import { expect, it } from 'vitest';
import { billingAgreementTermsSchema } from '@hsm/contracts';
import { planScheduledResidentCharge } from '../src/resident-billing-plan.js';
import { rentTerms, rentStay, rentAgreement } from './resident-rent.fixture.js';
const selection = { item: 'rent', cadence: 'periodic', periodIndex: 0 };
const context = { stay: rentStay(), agreement: rentAgreement(), terms: rentTerms, transport: [] };
const feeTerms = billingAgreementTermsSchema.parse({
  ...rentTerms,
  fees: [
    { code: 'mess', cadence: 'monthly', amountPaisa: 3101 },
    { code: 'admission', cadence: 'one_time', amountPaisa: 777 },
  ],
  policy: {
    ...rentTerms.policy,
    feeBilling: {
      oneTimeDueOffsetDays: 2,
      monthly: { cycle: { kind: 'calendar_month', dueDay: 7 }, proration: { kind: 'full_period' } },
    },
  },
});
it('RENT-004: scheduled rent retains the canonical agreed source, exact amount and due date', () => {
  expect(planScheduledResidentCharge(context, selection)).toMatchObject({
    kind: 'rent',
    sourceKey: 'rent:2028-02-01:2028-03-01',
    description: 'Rent 2028-02-01 to 2028-03-01',
    amountPaisa: 1800001n,
    dueDate: '2028-02-05',
  });
});
it('FIN-004: a periodic fee uses its independently agreed monthly timing and price', () => {
  expect(
    planScheduledResidentCharge({ ...context, terms: feeTerms }, { ...selection, item: 'mess' }),
  ).toMatchObject({
    kind: 'mess',
    sourceKey: 'fee:mess:monthly:2028-02-01:2028-03-01',
    description: 'Mess 2028-02-01 to 2028-03-01',
    amountPaisa: 3101n,
    dueDate: '2028-02-07',
  });
});
it('FIN-004: one-time fees retain their canonical source without invented period dates', () => {
  expect(
    planScheduledResidentCharge(
      { ...context, terms: feeTerms },
      { ...selection, item: 'admission', cadence: 'one_time' },
    ),
  ).toMatchObject({
    kind: 'admission',
    sourceKey: 'fee:admission:one_time',
    description: 'Admission fee',
    amountPaisa: 777n,
    periodStart: null,
    periodEnd: null,
    dueDate: '2028-02-03',
  });
});
it.each([
  { ...selection, periodIndex: 1 },
  { ...selection, item: 'admission', cadence: 'one_time', periodIndex: 1 },
])('RENT-004: exhausted selection %j produces no financial plan', (value) => {
  expect(planScheduledResidentCharge({ ...context, terms: feeTerms }, value)).toBeNull();
});
it('RENT-004: scheduled manual proration remains unresolved instead of becoming zero or full rent', () => {
  const terms = billingAgreementTermsSchema.parse({
    ...rentTerms,
    policy: { ...rentTerms.policy, proration: { kind: 'manual' } },
  });
  expect(
    planScheduledResidentCharge(
      { ...context, terms, stay: rentStay({ moveInDate: '2028-02-10' }) },
      selection,
    )?.amountPaisa,
  ).toBeNull();
});
it('SEC-003: a stored rent schedule cannot masquerade as a one-time fee', () => {
  expect(() => planScheduledResidentCharge(context, { ...selection, cadence: 'one_time' })).toThrow(
    'Billing schedule unavailable',
  );
});
it('RENT-003: period generation cannot cross an effective agreement amendment', () => {
  expect(() =>
    planScheduledResidentCharge(
      { ...context, agreement: rentAgreement({ effectiveFrom: '2028-02-02' }) },
      selection,
    ),
  ).toThrow('Agreed charge requires an explicit adjustment');
});
it('FIN-004: absent fee timing is an error, never an omitted charge or an invented due date', () => {
  expect(() => planScheduledResidentCharge(context, { ...selection, item: 'mess' })).toThrow(
    'An exact disclosed fee is required',
  );
});
it.each([
  { ...selection, amountPaisa: 0 },
  { ...selection, item: 'custom' },
  { ...selection, periodIndex: -1 },
])('SEC-003: invalid or amount-bearing scheduled selection is rejected: %j', (value) => {
  expect(() => planScheduledResidentCharge(context, value)).toThrow();
});
