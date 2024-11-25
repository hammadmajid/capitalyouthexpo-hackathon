'use client';
import {
  moneyFromJson,
  type BillingAgreementTerms,
  type BillingCatalogEntry,
} from '@hsm/contracts';
import { admissionAmount } from './admission-billing-values';
type Props = {
  fees: BillingAgreementTerms['fees'];
  catalog: BillingCatalogEntry[];
  selected: string[];
  onToggle: (key: string) => void;
};
export function AdmissionAgreementChoices(props: Props) {
  return (
    <div className="space-y-3">
      <fieldset className="space-y-2">
        <legend>Disclosed additional fees</legend>
        {!props.fees.length ? <p>No additional fees offered for this room type.</p> : null}
        {props.fees.map((fee) => {
          const key = fee.code + ':' + fee.cadence;
          return (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={props.selected.includes(key)}
                onChange={() => props.onToggle(key)}
              />
              {fee.code} ({fee.cadence === 'monthly' ? 'monthly' : 'one-time'}) ·{' '}
              {admissionAmount(moneyFromJson(fee.amountPaisa))}
            </label>
          );
        })}
      </fieldset>
      <fieldset className="space-y-2">
        <legend>Disclosed approved charge unit prices</legend>
        <p>Select agreed unit prices only. This does not issue a charge or record a payment.</p>
        {props.catalog.map((entry) => (
          <label key={entry.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={props.selected.includes(entry.id)}
              onChange={() => props.onToggle(entry.id)}
            />
            {entry.name} · {admissionAmount(moneyFromJson(entry.unitAmountPaisa))} /{' '}
            {entry.unitLabel}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
