'use client';
import { GroupedNumberInput } from './ui/grouped-number-input';
import { formatDate, type ManualStayInput } from '@hsm/contracts';
import { previewAdmissionPeriodFromDate } from '@hsm/api-client';
import {
  admissionAmount,
  type AdmissionObligation,
  type AdmissionPeriodDraft,
} from './admission-billing-values';
type Props = {
  manual: ManualStayInput;
  obligation: AdmissionObligation;
  value: AdmissionPeriodDraft;
  disabled: boolean;
  onChange: (value: AdmissionPeriodDraft) => void;
};
function preview({ manual, obligation, value }: Props, manualAmount: string) {
  if (!value.startsOn) return;
  try {
    return previewAdmissionPeriodFromDate({
      stay: manual.period,
      terms: manual.terms,
      item: obligation.item,
      cadence: obligation.cadence,
      startsOn: value.startsOn,
      manualAmount,
    });
  } catch {
    return;
  }
}
export function AdmissionBillingLine(props: Props) {
  const { manual, obligation, value, disabled, onChange } = props,
    base = preview(props, ''),
    result = preview(props, value.manualAmount),
    manualRequired = base?.period.amountPaisa === null;
  return (
    <fieldset disabled={disabled} className="space-y-3 rounded-input border border-hsm-border p-4">
      <legend className="font-semibold capitalize">{obligation.label}</legend>
      {obligation.cadence === 'one_time' ? (
        <p>
          One-time period starts with the agreed Stay:{' '}
          {formatDate(manual.period.moveInDate + 'T00:00:00.000Z')}
        </p>
      ) : (
        <label className="field-label">
          First billing period starts
          <input
            className="field-input"
            type="date"
            aria-label={obligation.label + ' billing starts'}
            value={value.startsOn}
            required
            onChange={(event) => onChange({ startsOn: event.target.value, manualAmount: '' })}
          />
        </label>
      )}
      {manualRequired ? (
        <label className="field-label">
          Agreed amount for this partial period (PKR)
          <GroupedNumberInput
            className="field-input"
            aria-label={obligation.label + ' partial amount'}
            value={value.manualAmount}
            required
            onValueChange={(amount) => onChange({ ...value, manualAmount: amount })}
          />
        </label>
      ) : null}
      {result ? (
        <dl className="space-y-1">
          <div>
            <dt>Due date</dt>
            <dd>{formatDate(result.period.dueDate + 'T00:00:00.000Z')}</dd>
          </div>
          <div>
            <dt>Initial charge preview</dt>
            <dd>
              {result.period.amountPaisa === null
                ? 'Enter the agreed partial amount'
                : admissionAmount(result.period.amountPaisa)}
            </dd>
          </div>
        </dl>
      ) : value.startsOn ? (
        <p>Select an exact start from the agreed billing calendar and check the partial amount.</p>
      ) : null}
    </fieldset>
  );
}
