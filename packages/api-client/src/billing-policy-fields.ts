import type { BillingDraft } from './billing-policy-draft.js';
export type BillingField = {
  name: Exclude<keyof BillingDraft, 'agreementTemplate'>;
  label: string;
  choices?: readonly (readonly [string, string])[];
  amount?: boolean;
};
const monthly = [
  ['calendar_month', 'Calendar month'],
  ['anniversary_month', 'Monthly anniversary'],
] as const;
const rounding = [
  ['half_up', 'Nearest paisa (half up)'],
  ['down', 'Round down'],
  ['up', 'Round up'],
] as const;
const rentProration = [
  ['full_period', 'Full period'],
  ['calendar_days', 'By calendar days'],
  ['manual', 'Manual resolution'],
  ['fixed_first_period', 'Fixed first-period amount'],
] as const;
const number = (
  name: Exclude<keyof BillingDraft, 'agreementTemplate'>,
  label: string,
  amount = false,
): BillingField => ({
  name,
  label,
  amount,
});
const select = (
  name: Exclude<keyof BillingDraft, 'agreementTemplate'>,
  label: string,
  choices: BillingField['choices'],
): BillingField => ({ name, label, ...(choices ? { choices } : {}) });
function cycle(d: BillingDraft, fee = false): BillingField[] {
  const kind = fee ? d.monthlyFeeCycle : d.cycleKind,
    fields = [
      select(
        fee ? 'monthlyFeeCycle' : 'cycleKind',
        fee ? 'Monthly fee cycle' : 'Rent cycle',
        fee
          ? monthly
          : [
              ...monthly,
              ['week', 'Weekly'],
              ['fixed_period', 'Fixed day interval'],
              ['term', 'Fixed term'],
            ],
      ),
    ];
  if (kind === 'calendar_month')
    fields.push(
      number(
        fee ? 'monthlyFeeDueDay' : 'dueDay',
        fee ? 'Monthly fee due day (1–31)' : 'Rent due day (1–31)',
      ),
    );
  else if (kind)
    fields.push(
      number(
        fee ? 'monthlyFeeDueOffset' : 'dueOffsetDays',
        fee ? 'Monthly fee due offset (days)' : 'Rent due offset (days)',
      ),
    );
  if (!fee && kind === 'fixed_period')
    fields.push(number('periodDays', 'Rent period length (days)'));
  return fields;
}
function proration(d: BillingDraft, family: 'rent' | 'checkout' | 'fee'): BillingField[] {
  const keys = {
    rent: {
      kind: 'prorationKind',
      rounding: 'prorationRounding',
      amount: 'prorationAmount',
      title: 'Rent proration',
    },
    checkout: {
      kind: 'checkoutKind',
      rounding: 'checkoutRounding',
      amount: 'checkoutAmount',
      title: 'Early checkout adjustment',
    },
    fee: {
      kind: 'monthlyFeeProration',
      rounding: 'monthlyFeeRounding',
      amount: undefined,
      title: 'Monthly fee proration',
    },
  } as const;
  const key = keys[family],
    kind = d[key.kind],
    fields = [
      select(
        key.kind,
        key.title,
        family === 'fee'
          ? rentProration.filter(([value]) => value !== 'fixed_first_period')
          : rentProration,
      ),
    ];
  if (kind === 'calendar_days')
    fields.push(select(key.rounding, key.title + ' rounding', rounding));
  if (kind === 'fixed_first_period' && key.amount)
    fields.push(number(key.amount, key.title + ' fixed amount (PKR)', true));
  return fields;
}
function late(d: BillingDraft): BillingField[] {
  const fields = [
    select('lateKind', 'Late charge policy', [
      ['disabled', 'Disabled'],
      ['manual', 'Manual resolution'],
      ['fixed', 'Fixed amount'],
      ['percentage', 'Percentage'],
    ]),
  ];
  if (d.lateKind === 'fixed') fields.push(number('lateAmount', 'Late charge (PKR)', true));
  if (d.lateKind === 'percentage') {
    fields.push(
      number('lateBasisPoints', 'Late rate (basis points; 100 = 1%)'),
      select('lateCapKind', 'Late charge cap', [
        ['none', 'No cap'],
        ['fixed', 'Fixed cap'],
      ]),
    );
    if (d.lateCapKind === 'fixed')
      fields.push(number('lateCapAmount', 'Late charge cap (PKR)', true));
  }
  return fields;
}
export function billingPolicyFields(d: BillingDraft): BillingField[] {
  const fields = [
    ...cycle(d),
    ...proration(d, 'rent'),
    number('graceDays', 'Grace period (days)'),
    ...late(d),
    number('noticeDays', 'Notice period (days)'),
    ...proration(d, 'checkout'),
    select('openEnded', 'Allow open-ended stays', [
      ['true', 'Yes'],
      ['false', 'No'],
    ]),
    select('customCharges', 'Custom charge policy', [
      ['disabled', 'Disabled'],
      ['catalog_only', 'Only agreed approved charges'],
    ]),
    select('feeTiming', 'Disclosed fee timing', [
      ['unconfigured', 'Not configured'],
      ['configured', 'Configured'],
    ]),
  ];
  if (d.feeTiming === 'configured') {
    fields.push(
      number('oneTimeDueDays', 'One-time fee due offset (days)'),
      select('monthlyFeeTiming', 'Monthly fee timing', [
        ['unconfigured', 'Not configured'],
        ['configured', 'Configured'],
      ]),
    );
    if (d.monthlyFeeTiming === 'configured') fields.push(...cycle(d, true), ...proration(d, 'fee'));
  }
  return fields;
}
