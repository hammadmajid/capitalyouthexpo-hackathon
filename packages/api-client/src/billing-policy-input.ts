import { billingPolicySchema } from '@hsm/contracts';
import type { BillingDraft } from './billing-policy-draft.js';
import { billingFormPaisa as inventoryPaisa } from './billing-form-money.js';
function whole(input: string) {
  const value = input.trim();
  if (!/^[0-9]{1,16}$/.test(value)) throw Error('Whole number required');
  const amount = Number(value);
  if (!Number.isSafeInteger(amount)) throw Error('Whole number exceeds the supported limit');
  return amount;
}
function choice(input: string) {
  if (input === 'true') return true;
  if (input === 'false') return false;
  throw Error('Choose yes or no');
}
function cycle(kind: string, day: string, offset: string, period: string) {
  switch (kind) {
    case 'calendar_month':
      return { kind, dueDay: whole(day) };
    case 'anniversary_month':
    case 'week':
    case 'term':
      return { kind, dueOffsetDays: whole(offset) };
    case 'fixed_period':
      return { kind, periodDays: whole(period), dueOffsetDays: whole(offset) };
    default:
      throw Error('Choose a billing cycle');
  }
}
function proration(kind: string, rounding: string, amount: string, allowFixed = true) {
  switch (kind) {
    case 'full_period':
    case 'manual':
      return { kind };
    case 'calendar_days':
      return { kind, rounding };
    case 'fixed_first_period':
      if (!allowFixed) throw Error('Monthly fees do not support a fixed first rent amount');
      return { kind, amountPaisa: inventoryPaisa(amount) };
    default:
      throw Error('Choose a proration policy');
  }
}
function late(d: BillingDraft) {
  switch (d.lateKind) {
    case 'disabled':
    case 'manual':
      return { kind: d.lateKind };
    case 'fixed':
      return { kind: d.lateKind, amountPaisa: inventoryPaisa(d.lateAmount) };
    case 'percentage':
      if (d.lateCapKind !== 'none' && d.lateCapKind !== 'fixed')
        throw Error('Choose a late-charge cap policy');
      return {
        kind: d.lateKind,
        basisPoints: whole(d.lateBasisPoints),
        capPaisa: d.lateCapKind === 'none' ? null : inventoryPaisa(d.lateCapAmount),
      };
    default:
      throw Error('Choose a late-charge policy');
  }
}
function feeTiming(d: BillingDraft) {
  if (d.feeTiming === 'unconfigured') return undefined;
  if (d.feeTiming !== 'configured') throw Error('Choose fee timing configuration');
  const oneTimeDueOffsetDays = whole(d.oneTimeDueDays);
  if (d.monthlyFeeTiming === 'unconfigured') return { oneTimeDueOffsetDays };
  if (d.monthlyFeeTiming !== 'configured') throw Error('Choose monthly fee timing configuration');
  return {
    oneTimeDueOffsetDays,
    monthly: {
      cycle: cycle(d.monthlyFeeCycle, d.monthlyFeeDueDay, d.monthlyFeeDueOffset, ''),
      proration: proration(d.monthlyFeeProration, d.monthlyFeeRounding, '', false),
    },
  };
}
// FIN-004 / RENT-003: only explicit selected fields; no inferred financial defaults.
export function billingPolicyFromDraft(d: BillingDraft) {
  const feeBilling = feeTiming(d);
  return billingPolicySchema.parse({
    cycle: cycle(d.cycleKind, d.dueDay, d.dueOffsetDays, d.periodDays),
    proration: proration(d.prorationKind, d.prorationRounding, d.prorationAmount),
    graceDays: whole(d.graceDays),
    lateCharge: late(d),
    noticeDays: whole(d.noticeDays),
    earlyCheckout: proration(d.checkoutKind, d.checkoutRounding, d.checkoutAmount),
    allowOpenEnded: choice(d.openEnded),
    customCharges: d.customCharges,
    ...(feeBilling === undefined ? {} : { feeBilling }),
    ...(d.agreementTemplate ? { agreementTemplate: d.agreementTemplate } : {}),
  });
}
