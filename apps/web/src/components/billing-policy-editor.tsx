'use client';
import type { FormEvent } from 'react';
import type { BillingDraft } from '../lib/billing-policy-draft';
import { billingPolicyFields } from './billing-policy-fields';
import { Button } from './ui/button';
import { GroupedNumberInput } from './ui/grouped-number-input';
export function BillingPolicyEditor({
  draft,
  setDraft,
  disabled,
  submit,
  cancel,
  error,
}: {
  draft: BillingDraft;
  setDraft: (draft: BillingDraft) => void;
  disabled: boolean;
  submit: (event: FormEvent) => void;
  cancel: () => void;
  error: string;
}) {
  return (
    <form aria-label="Billing policy editor" className="space-y-4" onSubmit={submit}>
      <p>
        Save a new policy version for future agreements. Existing agreements retain their disclosed
        terms.
      </p>
      <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
        <legend className="font-semibold">Explicit financial settings</legend>
        {billingPolicyFields(draft).map((field) => (
          <label key={field.name} className="field-label">
            {field.label}
            {field.choices ? (
              <select
                required
                className="field-input"
                value={draft[field.name]}
                onChange={(event) => setDraft({ ...draft, [field.name]: event.target.value })}
              >
                <option value="">Choose a setting</option>
                {field.choices.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            ) : (
              <GroupedNumberInput
                required
                className="field-input"
                maxLength={field.amount ? 17 : 16}
                value={draft[field.name]}
                onValueChange={(value) => setDraft({ ...draft, [field.name]: value })}
              />
            )}
          </label>
        ))}
      </fieldset>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={disabled}>
        Save new billing policy version
      </Button>
      <Button type="button" variant="ghost" disabled={disabled} onClick={cancel}>
        Cancel billing policy edit
      </Button>
    </form>
  );
}
