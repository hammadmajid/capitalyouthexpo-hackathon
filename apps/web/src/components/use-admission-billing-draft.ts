import { useState, type FormEvent } from 'react';
import {
  manualAdmissionCommandSchema,
  type ManualAdmissionCommand,
  type ManualStayInput,
} from '@hsm/contracts';
import { admissionSelectionFromDate } from '@hsm/api-client';
import { admissionObligations, type AdmissionPeriodDraft } from './admission-billing-values';
type State = {
  values: Map<string, AdmissionPeriodDraft>;
  prepared: ManualAdmissionCommand | undefined;
  confirmed: boolean;
  invalid: boolean;
};
function initial(manual: ManualStayInput): State {
  return {
    values: new Map(
      admissionObligations(manual).map((item) => [
        item.key,
        { startsOn: item.cadence === 'one_time' ? manual.period.moveInDate : '', manualAmount: '' },
      ]),
    ),
    prepared: undefined,
    confirmed: false,
    invalid: false,
  };
}
function command(manual: ManualStayInput, values: State['values']) {
  const initialBilling = admissionObligations(manual).map((item) => {
    const value = values.get(item.key);
    if (!value) throw Error('Billing choice absent');
    return admissionSelectionFromDate({
      stay: manual.period,
      terms: manual.terms,
      item: item.item,
      cadence: item.cadence,
      ...value,
    });
  });
  return manualAdmissionCommandSchema.parse({ manual, initialBilling });
}
export function useAdmissionBillingDraft(
  manual: ManualStayInput,
  pending: boolean,
  unavailable: boolean,
) {
  const [state, setState] = useState(() => initial(manual)),
    blocked = pending || unavailable;
  function update(key: string, value: AdmissionPeriodDraft) {
    if (blocked || state.prepared) return;
    setState((current) => ({
      ...current,
      values: new Map(current.values).set(key, value),
      confirmed: false,
      invalid: false,
    }));
  }
  function review(event: FormEvent) {
    event.preventDefault();
    if (blocked || state.prepared) return;
    try {
      const prepared = command(manual, state.values);
      setState((current) => ({ ...current, prepared, confirmed: false, invalid: false }));
    } catch {
      setState((current) => ({ ...current, prepared: undefined, invalid: true }));
    }
  }
  function edit() {
    if (!blocked) setState((current) => ({ ...current, prepared: undefined, confirmed: false }));
  }
  function confirm(value: boolean) {
    if (!blocked && state.prepared) setState((current) => ({ ...current, confirmed: value }));
  }
  return { ...state, obligations: admissionObligations(manual), update, review, edit, confirm };
}
