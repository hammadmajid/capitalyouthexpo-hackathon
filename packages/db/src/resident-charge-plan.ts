import type { AgreedFeePeriod, Money, RentPeriod, TransportPeriod } from '@hsm/contracts';
import type { PlannedResidentCharge } from './resident-charge-posting.js';
export type PendingResidentCharge = Omit<PlannedResidentCharge, 'amountPaisa'> & {
  amountPaisa: Money | null;
  issueOn?: string;
};
// RENT-003 / FIN-004: one description/source mapping for human and scheduled postings.
export function rentChargePlan(period: RentPeriod): PendingResidentCharge {
  return {
    kind: 'rent',
    sourceKey: 'rent:' + period.periodStart + ':' + period.periodEnd,
    description: 'Rent ' + period.periodStart + ' to ' + period.periodEnd,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    dueDate: period.dueDate,
    amountPaisa: period.amountPaisa,
  };
}
export function feeChargePlan(period: AgreedFeePeriod): PendingResidentCharge {
  const label = { mess: 'Mess', utilities: 'Utilities', admission: 'Admission' }[period.code];
  return {
    kind: period.code,
    sourceKey: period.sourceKey,
    description:
      period.cadence === 'one_time'
        ? label + ' fee'
        : label + ' ' + period.periodStart + ' to ' + period.periodEnd,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    dueDate: period.dueDate,
    amountPaisa: period.amountPaisa,
  };
}
export function billingRunAt(plan: PendingResidentCharge) {
  return plan.issueOn
    ? new Date(plan.issueOn + 'T00:00:00+05:00')
    : new Date(plan.dueDate + 'T00:00:00.000Z');
}
// SERV-002 / P9-M5: transport is its own visible line, never folded into rent.
export function transportChargePlan(period: TransportPeriod): PendingResidentCharge {
  return {
    kind: 'transport',
    ...(period.issueOn ? { issueOn: period.issueOn } : {}),
    sourceKey: period.sourceKey,
    description: 'Transport ' + period.periodStart + ' to ' + period.periodEnd,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    dueDate: period.dueDate,
    amountPaisa: period.amountPaisa,
  };
}
