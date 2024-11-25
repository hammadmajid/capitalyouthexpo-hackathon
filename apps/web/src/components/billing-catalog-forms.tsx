'use client';
import type { FormEvent } from 'react';
import { Button } from './ui/button';
import { GroupedNumberInput } from './ui/grouped-number-input';
export type CatalogDraft = { code: string; name: string; unitLabel: string; price: string };
export const emptyCatalogDraft: CatalogDraft = { code: '', name: '', unitLabel: '', price: '' };
const fields = [
  ['code', 'Charge code', 64],
  ['name', 'Charge name', 120],
  ['unitLabel', 'Unit label', 40],
  ['price', 'Unit price (PKR)', 17],
] as const;
export function CatalogCreateForm({
  draft,
  setDraft,
  disabled,
  submit,
}: {
  draft: CatalogDraft;
  setDraft: (draft: CatalogDraft) => void;
  disabled: boolean;
  submit: (event: FormEvent) => void;
}) {
  return (
    <form onSubmit={submit} aria-label="Create approved charge" className="space-y-3">
      <fieldset disabled={disabled} className="space-y-3">
        <legend className="font-semibold">New approved charge</legend>
        <p className="text-sm">Prices are retained. Use a new code when changing a price.</p>
        {fields.map(([key, label, maxLength]) => (
          <label key={key} className="field-label">
            {label}
            <GroupedNumberInput
              grouped={key === 'price'}
              className="field-input"
              value={draft[key]}
              maxLength={maxLength}
              required
              onValueChange={(value) => setDraft({ ...draft, [key]: value })}
            />
          </label>
        ))}
        <Button type="submit">Create approved charge</Button>
      </fieldset>
    </form>
  );
}
export function CatalogArchiveForm({
  name,
  reason,
  setReason,
  disabled,
  submit,
  cancel,
}: {
  name: string;
  reason: string;
  setReason: (value: string) => void;
  disabled: boolean;
  submit: (event: FormEvent) => void;
  cancel: () => void;
}) {
  return (
    <form onSubmit={submit} aria-label="Archive approved charge" className="space-y-3">
      <fieldset disabled={disabled} className="space-y-3">
        <legend className="font-semibold">Archive {name}</legend>
        <p className="text-sm">
          This stops new use of the charge. Existing agreements and financial history remain.
        </p>
        <label className="field-label">
          Archive reason
          <textarea
            className="field-input"
            required
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <Button type="submit">Confirm charge archive</Button>
        <Button type="button" variant="ghost" onClick={cancel}>
          Cancel charge archive
        </Button>
      </fieldset>
    </form>
  );
}
