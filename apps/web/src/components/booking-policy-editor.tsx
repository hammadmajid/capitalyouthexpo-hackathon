import { useState, type FormEvent } from 'react';
import type { BookingPolicyRead } from '@hsm/api-client';
import { parsePolicyForm, policyFormValues } from '../lib/booking-policy-form';
import { PolicyFields, PolicyLimitFields } from './booking-policy-fields';
import { Button } from './ui/button';
export function BookingPolicyEditor({
  settings,
  pending,
  disabled,
  onSave,
  onCancel,
}: {
  settings: BookingPolicyRead;
  pending: boolean;
  disabled: boolean;
  onSave: (input: unknown) => void;
  onCancel: () => void;
}) {
  const root = settings.target.level === 'platform';
  const [values, setValues] = useState(() =>
    policyFormValues(settings.configured ? (root ? settings.effective : settings.overrides) : {}),
  );
  const [limits, setLimits] = useState(() =>
    policyFormValues(settings.configured ? settings.limits : {}),
  );
  const [invalid, setInvalid] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || disabled) return;
    try {
      const input = parsePolicyForm(values, root, limits);
      setInvalid(false);
      onSave(input);
    } catch {
      setInvalid(true);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset disabled={pending || disabled} className="space-y-3">
        <legend className="font-semibold">{root ? 'Platform defaults' : 'Local overrides'}</legend>
        <p>
          {root
            ? 'Every default and safety limit must be explicitly configured.'
            : 'Blank values inherit from the parent. Maximum stay also accepts unlimited. An empty required-documents list makes CNIC optional.'}
        </p>
        <PolicyFields
          values={values}
          root={root}
          onChange={(field, value) => setValues((current) => ({ ...current, [field]: value }))}
        />
        {root ? (
          <PolicyLimitFields
            values={limits}
            onChange={(field, value) => setLimits((current) => ({ ...current, [field]: value }))}
          />
        ) : null}
        {invalid ? (
          <p role="alert">
            Choose valid explicit settings, whole-number limits and at least one allowed stay unit
            when overriding it.
          </p>
        ) : null}
        <div className="flex gap-3">
          <Button type="submit">{pending ? 'Saving policy…' : 'Save booking policy'}</Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel policy edit
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
