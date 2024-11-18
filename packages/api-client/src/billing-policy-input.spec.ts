import { billingPolicyFields } from './billing-policy-fields.js';
import { billingFormPaisa, billingFormRupees } from './billing-form-money.js';
import { expect, it } from 'vitest';
import { billingPolicySchema } from '@hsm/contracts';
import { billingDraftFrom } from './billing-policy-draft.js';
import { billingPolicyFromDraft } from './billing-policy-input.js';
const base = billingPolicySchema.parse({
  cycle: { kind: 'calendar_month', dueDay: 5 },
  proration: { kind: 'calendar_days', rounding: 'half_up' },
  graceDays: 3,
  lateCharge: { kind: 'disabled' },
  noticeDays: 15,
  earlyCheckout: { kind: 'manual' },
  allowOpenEnded: true,
  customCharges: 'catalog_only',
});
const patches = [
  {},
  { cycle: { kind: 'anniversary_month', dueOffsetDays: 0 } },
  { cycle: { kind: 'week', dueOffsetDays: 6 } },
  { cycle: { kind: 'fixed_period', periodDays: 10, dueOffsetDays: 2 } },
  { cycle: { kind: 'term', dueOffsetDays: 0 } },
  { proration: { kind: 'full_period' } },
  { proration: { kind: 'manual' } },
  { proration: { kind: 'fixed_first_period', amountPaisa: Number.MAX_SAFE_INTEGER } },
  { proration: { kind: 'fixed_first_period', amountPaisa: 0 } },
  { proration: { kind: 'calendar_days', rounding: 'down' } },
  { proration: { kind: 'calendar_days', rounding: 'up' } },
  { lateCharge: { kind: 'manual' } },
  { lateCharge: { kind: 'fixed', amountPaisa: 1 } },
  { lateCharge: { kind: 'percentage', basisPoints: 100, capPaisa: null } },
  { lateCharge: { kind: 'percentage', basisPoints: 150, capPaisa: 0 } },
  { lateCharge: { kind: 'percentage', basisPoints: 250, capPaisa: 3500 } },
  { earlyCheckout: { kind: 'full_period' } },
  { earlyCheckout: { kind: 'calendar_days', rounding: 'down' } },
  { earlyCheckout: { kind: 'fixed_first_period', amountPaisa: 12550 } },
  { allowOpenEnded: false, customCharges: 'disabled' },
  { feeBilling: { oneTimeDueOffsetDays: 0 } },
  {
    feeBilling: {
      oneTimeDueOffsetDays: 2,
      monthly: {
        cycle: { kind: 'calendar_month', dueDay: 31 },
        proration: { kind: 'full_period' },
      },
    },
  },
  {
    feeBilling: {
      oneTimeDueOffsetDays: 2,
      monthly: {
        cycle: { kind: 'anniversary_month', dueOffsetDays: 1 },
        proration: { kind: 'calendar_days', rounding: 'up' },
      },
    },
  },
  {
    feeBilling: {
      oneTimeDueOffsetDays: 2,
      monthly: {
        cycle: { kind: 'anniversary_month', dueOffsetDays: 0 },
        proration: { kind: 'manual' },
      },
    },
  },
];
it.each(patches)(
  'RENT-003 / FIN-004: financial policy draft round-trip preserves every explicit fact %#',
  (patch) => {
    const policy = billingPolicySchema.parse({ ...base, ...patch });
    expect(billingPolicyFromDraft(billingDraftFrom(policy))).toEqual(policy);
  },
);
it('RENT-001: new policy starts blank and cannot invent a complete default', () => {
  const draft = billingDraftFrom();
  expect(Object.values(draft).every((value) => value === '')).toBe(true);
  expect(() => billingPolicyFromDraft(draft)).toThrow();
  expect(billingDraftFrom()).not.toBe(draft);
});
it.each(['', ' ', '-1', '1.2', '1e3', '0x10', 'Infinity', '9007199254740992', '1'.repeat(100)])(
  'FIN-004: invalid whole-day value %s never rounds or falls back',
  (value) => {
    expect(() => billingPolicyFromDraft({ ...billingDraftFrom(base), graceDays: value })).toThrow();
  },
);
it.each([
  { cycleKind: '' },
  { dueDay: '32' },
  { cycleKind: 'week', dueOffsetDays: '7' },
  { cycleKind: 'fixed_period', periodDays: '2', dueOffsetDays: '2' },
  { prorationKind: '' },
  { prorationKind: 'calendar_days', prorationRounding: '' },
  { prorationKind: 'fixed_first_period', prorationAmount: '1.005' },
  { lateKind: '' },
  { lateKind: 'fixed', lateAmount: '0' },
  { lateKind: 'percentage', lateBasisPoints: '100', lateCapKind: '' },
  { openEnded: '' },
  { openEnded: 'yes' },
  { customCharges: 'all' },
  { feeTiming: '' },
  { feeTiming: 'configured', oneTimeDueDays: '0', monthlyFeeTiming: '' },
  {
    feeTiming: 'configured',
    oneTimeDueDays: '0',
    monthlyFeeTiming: 'configured',
    monthlyFeeCycle: 'week',
    monthlyFeeDueOffset: '0',
    monthlyFeeProration: 'full_period',
  },
  {
    feeTiming: 'configured',
    oneTimeDueDays: '0',
    monthlyFeeTiming: 'configured',
    monthlyFeeCycle: 'anniversary_month',
    monthlyFeeDueOffset: '0',
    monthlyFeeProration: 'fixed_first_period',
  },
])('FIN-004: incomplete or unsupported selected rule %# fails closed', (patch) => {
  expect(() => billingPolicyFromDraft({ ...billingDraftFrom(base), ...patch })).toThrow();
});
it('FIN-004: hidden fields from an abandoned mode cannot change the selected financial policy', () => {
  const draft = {
    ...billingDraftFrom(base),
    periodDays: 'invalid',
    dueOffsetDays: 'invalid',
    lateAmount: 'invalid',
    lateCapAmount: 'invalid',
    monthlyFeeDueDay: 'invalid',
    prorationAmount: 'invalid',
    checkoutAmount: 'invalid',
  };
  expect(billingPolicyFromDraft(draft)).toEqual(base);
});

it.each(patches)(
  'FIN-004: shared policy fields describe every selected explicit setting %#',
  (patch) => {
    const policy = billingPolicySchema.parse({ ...base, ...patch });
    const draft = billingDraftFrom(policy);
    const fields = billingPolicyFields(draft);
    expect(new Set(fields.map((field) => field.name)).size).toBe(fields.length);
    for (const field of fields) {
      expect(field.label.trim().length).toBeGreaterThan(0);
      expect(draft[field.name]).not.toBe('');
      if (field.choices)
        expect(field.choices.some(([value]) => value === draft[field.name])).toBe(true);
    }
  },
);
it('RENT-001: shared field choices start empty and expose only selected dependent fields', () => {
  const draft = billingDraftFrom();
  const names = billingPolicyFields(draft).map((field) => field.name);
  expect(names).toContain('cycleKind');
  for (const hidden of [
    'dueDay',
    'dueOffsetDays',
    'periodDays',
    'lateAmount',
    'lateCapAmount',
    'monthlyFeeCycle',
  ])
    expect(names).not.toContain(hidden);
  const fixed = billingPolicyFields({ ...draft, lateKind: 'percentage', lateCapKind: 'fixed' });
  expect(fixed.map((field) => field.name)).toEqual(
    expect.arrayContaining(['lateBasisPoints', 'lateCapKind', 'lateCapAmount']),
  );
});
it.each([0, 1, 1250, Number.MAX_SAFE_INTEGER])(
  'FIN-004: shared exact money adapter round trips %s paisa',
  (value) => {
    expect(billingFormPaisa(billingFormRupees(value))).toBe(value);
  },
);
it.each([
  '',
  '-1',
  '+1',
  '01',
  '.5',
  '1.',
  '1.001',
  '1e3',
  '1,000',
  'Infinity',
  '90071992547409.92',
  '1'.repeat(100),
])('FIN-004: shared exact money input rejects %s', (value) => {
  expect(() => billingFormPaisa(value)).toThrow();
});
it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity])(
  'FIN-004: shared money display rejects invalid integer paisa %s',
  (value) => {
    expect(() => billingFormRupees(value)).toThrow();
  },
);

it('STAY-002: financial edits preserve the original agreement template metadata', () => {
  const policy = {
    ...base,
    agreementTemplate: { title: 'House agreement', text: 'Resident terms', fileId: null },
  };
  expect(billingPolicyFromDraft(billingDraftFrom(policy))).toEqual(policy);
});
