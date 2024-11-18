import type { BillingPolicy } from '@hsm/contracts';
import { billingFormRupees as inventoryRupees } from './billing-form-money.js';
export const emptyBillingDraft = {
  cycleKind: '',
  dueDay: '',
  dueOffsetDays: '',
  periodDays: '',
  prorationKind: '',
  prorationAmount: '',
  prorationRounding: '',
  graceDays: '',
  lateKind: '',
  lateAmount: '',
  lateBasisPoints: '',
  lateCapKind: '',
  lateCapAmount: '',
  noticeDays: '',
  checkoutKind: '',
  checkoutAmount: '',
  checkoutRounding: '',
  openEnded: '',
  customCharges: '',
  feeTiming: '',
  oneTimeDueDays: '',
  monthlyFeeTiming: '',
  monthlyFeeCycle: '',
  monthlyFeeDueDay: '',
  monthlyFeeDueOffset: '',
  monthlyFeeProration: '',
  monthlyFeeRounding: '',
};
export type BillingDraft = typeof emptyBillingDraft & {
  agreementTemplate?: BillingPolicy['agreementTemplate'];
};
function proration(value: BillingPolicy['proration']) {
  return {
    kind: value.kind,
    amount: value.kind === 'fixed_first_period' ? inventoryRupees(value.amountPaisa) : '',
    rounding: value.kind === 'calendar_days' ? value.rounding : '',
  };
}
export function billingDraftFrom(policy?: BillingPolicy): BillingDraft {
  if (!policy) return { ...emptyBillingDraft };
  const cycle = policy.cycle,
    first = proration(policy.proration),
    checkout = proration(policy.earlyCheckout),
    late = policy.lateCharge,
    fees = policy.feeBilling,
    monthly = fees?.monthly;
  return {
    ...emptyBillingDraft,
    ...(policy.agreementTemplate ? { agreementTemplate: policy.agreementTemplate } : {}),
    cycleKind: cycle.kind,
    dueDay: cycle.kind === 'calendar_month' ? String(cycle.dueDay) : '',
    dueOffsetDays: cycle.kind !== 'calendar_month' ? String(cycle.dueOffsetDays) : '',
    periodDays: cycle.kind === 'fixed_period' ? String(cycle.periodDays) : '',
    prorationKind: first.kind,
    prorationAmount: first.amount,
    prorationRounding: first.rounding,
    graceDays: String(policy.graceDays),
    lateKind: late.kind,
    lateAmount: late.kind === 'fixed' ? inventoryRupees(late.amountPaisa) : '',
    lateBasisPoints: late.kind === 'percentage' ? String(late.basisPoints) : '',
    lateCapKind: late.kind === 'percentage' ? (late.capPaisa === null ? 'none' : 'fixed') : '',
    lateCapAmount:
      late.kind === 'percentage' && late.capPaisa !== null ? inventoryRupees(late.capPaisa) : '',
    noticeDays: String(policy.noticeDays),
    checkoutKind: checkout.kind,
    checkoutAmount: checkout.amount,
    checkoutRounding: checkout.rounding,
    openEnded: String(policy.allowOpenEnded),
    customCharges: policy.customCharges,
    feeTiming: fees ? 'configured' : 'unconfigured',
    oneTimeDueDays: fees ? String(fees.oneTimeDueOffsetDays) : '',
    monthlyFeeTiming: fees ? (monthly ? 'configured' : 'unconfigured') : '',
    monthlyFeeCycle: monthly?.cycle.kind ?? '',
    monthlyFeeDueDay: monthly?.cycle.kind === 'calendar_month' ? String(monthly.cycle.dueDay) : '',
    monthlyFeeDueOffset:
      monthly?.cycle.kind === 'anniversary_month' ? String(monthly.cycle.dueOffsetDays) : '',
    monthlyFeeProration: monthly?.proration.kind ?? '',
    monthlyFeeRounding:
      monthly?.proration.kind === 'calendar_days' ? monthly.proration.rounding : '',
  };
}
