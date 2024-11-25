import {
  formatMoney,
  type ManualStayInput,
  type Money,
  type AdmissionBillingSelection,
} from '@hsm/contracts';
export type AdmissionObligation = {
  key: string;
  label: string;
  item: AdmissionBillingSelection['item'];
  cadence: AdmissionBillingSelection['cadence'];
};
export type AdmissionPeriodDraft = { startsOn: string; manualAmount: string };
export function admissionObligations(manual: ManualStayInput): AdmissionObligation[] {
  return [
    { key: 'rent:periodic', label: 'Rent', item: 'rent', cadence: 'periodic' },
    ...manual.terms.fees.map((fee) => ({
      key: fee.code + ':' + fee.cadence,
      label: fee.code + ' (' + (fee.cadence === 'monthly' ? 'monthly' : 'one-time') + ')',
      item: fee.code,
      cadence: fee.cadence === 'monthly' ? ('periodic' as const) : ('one_time' as const),
    })),
  ];
}
// Financial review retains the exact paisa part while reusing the shared whole-PKR formatter.
export function admissionAmount(value: Money) {
  return formatMoney(value) + '.' + String(value % 100n).padStart(2, '0');
}
