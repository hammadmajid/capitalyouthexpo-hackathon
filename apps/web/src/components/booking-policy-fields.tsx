import {
  policyNumbers,
  policyBooleans,
  policyLists,
  limitNumbers,
  type PolicyFormValues,
} from '../lib/booking-policy-form';
export function PolicyFields({
  values,
  root,
  onChange,
}: {
  values: PolicyFormValues;
  root: boolean;
  onChange: (field: string, value: string) => void;
}) {
  return (
    <>
      <label className="field-label">
        Booking mode
        <select
          className="field-input"
          value={values.bookingMode ?? ''}
          onChange={(event) => onChange('bookingMode', event.target.value)}
        >
          <option value="">{root ? 'Choose booking mode' : 'Inherit booking mode'}</option>
          <option value="request">Approval request</option>
          <option value="instant">Instant booking</option>
        </select>
      </label>
      {policyNumbers.map(([field, label]) => (
        <label className="field-label" key={field}>
          {label}
          <input
            className="field-input"
            value={values[field] ?? ''}
            maxLength={10}
            placeholder={root ? 'Required' : 'Inherit'}
            inputMode={field === 'maximumStayDays' ? 'text' : 'numeric'}
            onChange={(event) => onChange(field, event.target.value)}
          />
        </label>
      ))}
      {policyBooleans.map(([field, label]) => (
        <label className="field-label" key={field}>
          {label}
          <select
            className="field-input"
            value={values[field] ?? ''}
            onChange={(event) => onChange(field, event.target.value)}
          >
            <option value="">{root ? 'Choose explicitly' : 'Inherit'}</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </label>
      ))}
      {policyLists.map(([field, label, choices]) => {
        const inherit = values[field] === undefined || values[field] === 'inherit';
        const selected = (values[field] ?? '').split(',').filter(Boolean);
        return (
          <fieldset key={field} className="space-y-2">
            <legend>{label}</legend>
            {root ? null : (
              <label>
                <input
                  type="checkbox"
                  checked={inherit}
                  onChange={(event) => onChange(field, event.target.checked ? 'inherit' : '')}
                />{' '}
                Inherit {label.toLowerCase()}
              </label>
            )}
            {choices.map((choice) => (
              <label key={choice} className="flex gap-2">
                <input
                  type="checkbox"
                  disabled={!root && inherit}
                  checked={selected.includes(choice)}
                  onChange={(event) =>
                    onChange(
                      field,
                      (event.target.checked
                        ? [...selected, choice]
                        : selected.filter((item) => item !== choice)
                      ).join(','),
                    )
                  }
                />
                {choice.replaceAll('_', ' ')}
              </label>
            ))}
          </fieldset>
        );
      })}
    </>
  );
}
export function PolicyLimitFields({
  values,
  onChange,
}: {
  values: PolicyFormValues;
  onChange: (field: string, value: string) => void;
}) {
  return (
    <fieldset className="space-y-3">
      <legend>Platform safety limits</legend>
      {limitNumbers.map(([field, label]) => (
        <label className="field-label" key={field}>
          {label}
          <input
            className="field-input"
            inputMode="numeric"
            maxLength={10}
            value={values[field] ?? ''}
            onChange={(event) => onChange(field, event.target.value)}
          />
        </label>
      ))}
    </fieldset>
  );
}
