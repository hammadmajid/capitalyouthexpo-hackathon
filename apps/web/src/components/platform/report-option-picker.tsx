'use client';
import type { ReportNamedOption, ReportOptionQuery } from '@hsm/contracts';
import type { ReportOptionState } from './use-report-options';
import { errorMessage } from '../../lib/messages';
import { Button } from '../ui/button';
export function ReportOptionPicker({
  field,
  state,
  value,
  onChange,
  disabled,
}: {
  field: ReportOptionQuery['field'];
  state: ReportOptionState;
  value: ReportNamedOption | null;
  onChange: (value: ReportNamedOption | null) => void;
  disabled: boolean;
}) {
  const { query } = state;
  if (query.isError)
    return (
      <div>
        <p role="alert">{errorMessage(query.error)}</p>
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || query.isFetching}
          onClick={() => void query.refetch()}
        >
          Retry report {field} choices
        </Button>
      </div>
    );
  const rows = query.data?.data ?? [];
  const choices = value && !rows.some((row) => row.id === value.id) ? [value, ...rows] : rows;
  const busy = disabled || query.isFetching || query.isPending;
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="field-label">Report {field}</legend>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          state.search();
        }}
      >
        <input
          aria-label={'Search report ' + field}
          className="field-input"
          maxLength={80}
          value={state.draft}
          disabled={busy}
          onChange={(event) => state.setDraft(event.target.value)}
        />
        <Button variant="secondary" type="submit" disabled={busy}>
          Search {field} choices
        </Button>
      </form>
      {query.isPending ? <p role="status">Loading report {field} choices…</p> : null}
      <select
        aria-label={'Report ' + field}
        className="field-input"
        value={value?.id ?? ''}
        disabled={busy}
        onChange={(event) => onChange(choices.find((row) => row.id === event.target.value) ?? null)}
      >
        <option value="">
          All{' '}
          {field === 'building'
            ? 'buildings'
            : field === 'floor'
              ? 'floors'
              : field === 'room'
                ? 'rooms'
                : 'residents'}
        </option>
        {choices.map((row) => (
          <option key={row.id} value={row.id}>
            {row.name}
            {row.detail ? ' · ' + row.detail : ''}
            {row.archived ? ' (archived)' : ''}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !state.cursor}
          onClick={state.first}
        >
          First {field} choices
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !query.data?.nextCursor}
          onClick={state.next}
        >
          More {field} choices
        </Button>
      </div>
    </fieldset>
  );
}
