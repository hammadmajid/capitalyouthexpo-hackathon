'use client';
import { useState } from 'react';
import { formatDate, type ManualStayInput, type StaySummary } from '@hsm/contracts';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
type Choose = (resident: ManualStayInput['resident'], label: string) => void;
export function AdmissionResidentSearch({
  disabled,
  onSearch,
}: {
  disabled: boolean;
  onSearch: (value: string) => void;
}) {
  const [draft, setDraft] = useState('');
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) onSearch(draft.trim());
      }}
    >
      <label className="field-label">
        Find branch resident
        <input
          className="field-input"
          value={draft}
          maxLength={100}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      <Button type="submit" disabled={disabled}>
        Search branch residents
      </Button>
    </form>
  );
}
export function AdmissionResidentOptions({
  rows,
  loading,
  disabled,
  error,
  onRetry,
  onChoose,
}: {
  rows: StaySummary[] | undefined;
  loading: boolean;
  disabled: boolean;
  error: unknown;
  onRetry: () => void;
  onChoose: Choose;
}) {
  if (error)
    return (
      <div>
        <p role="alert">{errorMessage(error)}</p>
        <Button disabled={disabled} onClick={onRetry}>
          Retry branch residents
        </Button>
      </div>
    );
  if (loading) return <p role="status">Loading branch residents…</p>;
  if (disabled || !rows) return null;
  const residents = [...new Map(rows.map((row) => [row.residentId, row])).values()];
  return residents.length ? (
    <ul className="space-y-2">
      {residents.map((resident) => (
        <li key={resident.residentId}>
          <Button
            variant="secondary"
            onClick={() =>
              onChoose({ kind: 'existing', residentId: resident.residentId }, resident.displayName)
            }
          >
            Select {resident.displayName}
          </Button>
          <p className="text-sm text-hsm-secondary">
            Agreed Stay start: {formatDate(resident.moveInDate + 'T00:00:00.000Z')}
          </p>
        </li>
      ))}
    </ul>
  ) : (
    <p>No matching resident relationships on this page.</p>
  );
}
export function AdmissionResidentPages({
  cursor,
  nextCursor,
  disabled,
  onFirst,
  onNext,
}: {
  cursor: string | undefined;
  nextCursor: string | null | undefined;
  disabled: boolean;
  onFirst: () => void;
  onNext: (value: string) => void;
}) {
  return (
    <div className="flex gap-3">
      <Button variant="secondary" disabled={disabled || !cursor} onClick={onFirst}>
        First resident page
      </Button>
      <Button
        variant="secondary"
        disabled={disabled || !nextCursor}
        onClick={() => {
          if (!disabled && nextCursor) onNext(nextCursor);
        }}
      >
        Next resident page
      </Button>
    </div>
  );
}
