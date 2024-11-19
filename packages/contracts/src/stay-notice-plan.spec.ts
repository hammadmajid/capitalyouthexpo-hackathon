import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { planStayNotice } from './stay-notice-plan.js';
const terms = {
  policyVersionId: randomUUID(),
  currency: 'PKR',
  fees: [],
  catalog: [],
  rentAmountPaisa: 1800001,
  depositPaisa: 1000001,
  policy: {
    cycle: { kind: 'calendar_month', dueDay: 5 },
    proration: { kind: 'full_period' },
    graceDays: 0,
    lateCharge: { kind: 'disabled' },
    noticeDays: 15,
    earlyCheckout: { kind: 'manual' },
    allowOpenEnded: false,
    customCharges: 'disabled',
  },
};
const input = {
  submittedOn: '2028-02-20',
  terms,
  notice: {
    expectedVersion: 1,
    requestedCheckoutDate: '2028-03-06',
    isEmergency: false,
  },
};
it('OUT-001: agreed notice crosses leap February exactly and retains the policy version', () => {
  expect(planStayNotice(input)).toEqual({
    submittedOn: '2028-02-20',
    requestedCheckoutDate: '2028-03-06',
    earliestCompliantCheckoutDate: '2028-03-06',
    requiredNoticeDays: 15,
    providedNoticeDays: 15,
    shortfallDays: 0,
    isEmergency: false,
    policyVersionId: terms.policyVersionId,
  });
});
it.each([
  { date: '2028-02-20', provided: 0, shortfall: 15 },
  { date: '2028-03-05', provided: 14, shortfall: 1 },
  { date: '2028-03-07', provided: 16, shortfall: 0 },
])(
  'OUT-001/002: requested $date keeps exact notice shortfall without inventing a monetary penalty',
  ({ date, provided, shortfall }) => {
    const result = planStayNotice({
      ...input,
      notice: { ...input.notice, requestedCheckoutDate: date },
    });
    expect(result.providedNoticeDays).toBe(provided);
    expect(result.shortfallDays).toBe(shortfall);
    expect(Object.keys(result).some((key) => /amount|fee|paid|released/i.test(key))).toBe(false);
  },
);
it('OUT-002: emergency records shortfall and remains subject to disclosed policy', () => {
  const result = planStayNotice({
    ...input,
    notice: {
      ...input.notice,
      requestedCheckoutDate: input.submittedOn,
      isEmergency: true,
      reason: 'Family emergency',
    },
  });
  expect(result).toMatchObject({
    isEmergency: true,
    shortfallDays: 15,
    requiredNoticeDays: 15,
  });
});
it('OUT-001: explicit zero-day policy is retained without a default thirty days', () => {
  expect(
    planStayNotice({
      ...input,
      terms: { ...terms, policy: { ...terms.policy, noticeDays: 0 } },
    }),
  ).toMatchObject({
    requiredNoticeDays: 0,
    shortfallDays: 0,
    earliestCompliantCheckoutDate: input.submittedOn,
  });
});
it.each([
  { submittedOn: '0000-01-01' },
  { submittedOn: '2028-02-30' },
  { notice: { ...input.notice, requestedCheckoutDate: '2028-02-19' } },
  { notice: { ...input.notice, isEmergency: true } },
  { notice: { ...input.notice, paid: true } },
  { terms: { ...terms, policy: { ...terms.policy, noticeDays: -1 } } },
  { terms: { ...terms, policy: { ...terms.policy, noticeDays: 0.5 } } },
  { terms: { ...terms, policy: { ...terms.policy, noticeDays: undefined } } },
  { feesPaisa: 0 },
])('SEC-003 / OUT-001: invalid or injected planning input %# is rejected', (patch) => {
  expect(() => planStayNotice({ ...input, ...patch })).toThrow();
});
it('OUT-001: unsupported configured calendar overflow fails instead of silently clamping notice', () => {
  expect(() =>
    planStayNotice({
      ...input,
      submittedOn: '9999-12-30',
      notice: { ...input.notice, requestedCheckoutDate: '9999-12-31' },
    }),
  ).toThrow('Billing date exceeds supported calendar');
});
it('OUT-001: the lower supported database year uses calendar arithmetic without a century offset', () => {
  expect(
    planStayNotice({
      ...input,
      submittedOn: '0001-01-01',
      notice: { ...input.notice, requestedCheckoutDate: '0001-01-16' },
    }),
  ).toMatchObject({
    earliestCompliantCheckoutDate: '0001-01-16',
    providedNoticeDays: 15,
    shortfallDays: 0,
  });
});
