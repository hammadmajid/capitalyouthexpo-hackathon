'use client';
import { useState, type FormEvent } from 'react';
import { customAmenityInputSchema, type CustomAmenityInput } from '@hsm/contracts';
import { errorMessage } from '../../lib/messages';
import { Button } from '../ui/button';
import { useCustomAmenities } from './use-custom-amenities';
type Category = CustomAmenityInput['category'];
const categories = customAmenityInputSchema.shape.category.options;
type Props = {
  actorId: string;
  branchId: string;
  selected: string[];
  // Undefined keeps the list read-only (no grant, or a save in progress).
  change?: ((codes: string[]) => void) | undefined;
};
function toggle(codes: string[], code: string) {
  return codes.includes(code) ? codes.filter((entry) => entry !== code) : [...codes, code];
}
// LIST-00x: archived names stay visible only while still selected, so history is never lost.
export function CustomAmenities(props: Props) {
  const { query, command, rows, canEdit } = useCustomAmenities(props.actorId, props.branchId);
  const [editing, setEditing] = useState<{ code?: string; version?: string; name: string }>();
  const busy = command.isPending || command.unresolved;
  const shown = rows.filter((row) => row.isActive || props.selected.includes(row.code));
  return (
    <fieldset className="space-y-2" aria-label="Custom amenities">
      <legend className="font-semibold">Custom amenities</legend>
      {query.isPending ? <p role="status">Loading custom amenities…</p> : null}
      {shown.map((row) => (
        <div key={row.code} className="flex flex-wrap items-center gap-2">
          <label className="flex flex-1 gap-2">
            <input
              type="checkbox"
              checked={props.selected.includes(row.code)}
              disabled={!props.change || busy}
              onChange={() => props.change?.(toggle(props.selected, row.code))}
            />
            {row.name}
            {row.isActive ? '' : ' · Archived'}
          </label>
          {canEdit && row.isActive ? (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setEditing({ code: row.code, version: row.version, name: row.name })}
            >
              Edit {row.name}
            </Button>
          ) : null}
        </div>
      ))}
      {query.hasNextPage ? (
        <Button
          type="button"
          variant="secondary"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          More custom amenities
        </Button>
      ) : null}
      {canEdit && !editing ? (
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => setEditing({ name: '' })}
        >
          Add custom amenity
        </Button>
      ) : null}
      {editing ? (
        <AmenityForm
          key={editing.code ?? 'new'}
          initial={editing}
          category={rows.find((row) => row.code === editing.code)?.category ?? 'other'}
          busy={busy}
          save={(input) => {
            const body =
              editing.code && editing.version
                ? { kind: 'edit' as const, code: editing.code, version: editing.version, ...input }
                : { kind: 'create' as const, ...input };
            command.mutate(body, { onSuccess: () => setEditing(undefined) });
          }}
          archive={
            editing.code && editing.version
              ? () =>
                  command.mutate(
                    {
                      kind: 'archive',
                      code: editing.code ?? '',
                      version: editing.version ?? '',
                      reason: 'Owner removed amenity from available offerings',
                    },
                    { onSuccess: () => setEditing(undefined) },
                  )
              : undefined
          }
          cancel={() => setEditing(undefined)}
        />
      ) : null}
      {(query.error ?? command.error) ? (
        <p role="alert">{errorMessage(query.error ?? command.error)}</p>
      ) : null}
      {command.unresolved && !command.isPending ? (
        <Button type="button" onClick={() => command.retryOriginal()}>
          Retry amenity change
        </Button>
      ) : null}
    </fieldset>
  );
}
function AmenityForm(props: {
  initial: { name: string };
  category: Category;
  busy: boolean;
  save: (input: CustomAmenityInput) => void;
  archive: (() => void) | undefined;
  cancel: () => void;
}) {
  const [name, setName] = useState(props.initial.name),
    [category, setCategory] = useState<Category>(props.category);
  const parsed = customAmenityInputSchema.safeParse({ name, category });
  // A nested <form> is invalid inside the listing form, so this saves on button click.
  function submit(event: FormEvent) {
    event.preventDefault();
    if (parsed.success) props.save(parsed.data);
  }
  return (
    <div className="space-y-2 rounded-input border border-hsm-border p-3">
      <label className="field-label">
        Custom amenity name
        <input
          className="field-input"
          value={name}
          maxLength={80}
          placeholder="e.g. Laundry room"
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="field-label">
        Category
        <select
          className="field-input"
          value={category}
          onChange={(event) => setCategory(event.target.value as Category)}
        >
          {categories.map((value) => (
            <option key={value} value={value}>
              {value.charAt(0).toUpperCase() + value.slice(1)}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={props.busy || !parsed.success} onClick={submit}>
          Save amenity
        </Button>
        {props.archive ? (
          <Button type="button" variant="secondary" disabled={props.busy} onClick={props.archive}>
            Archive amenity
          </Button>
        ) : null}
        <Button type="button" variant="ghost" disabled={props.busy} onClick={props.cancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
