import { useState, type FormEvent } from 'react';
import {
  roomAmenitiesInputSchema,
  type RoomAmenitiesInput,
  type RoomAmenitiesState,
} from '@hsm/contracts';
import { Button } from './ui/button';
export function RoomAmenitiesEditor({
  initial,
  catalog,
  disabled,
  pending,
  onSave,
  onCancel,
}: {
  initial: RoomAmenitiesState;
  catalog: { code: string; name: string }[];
  disabled: boolean;
  pending: boolean;
  onSave: (input: RoomAmenitiesInput) => void;
  onCancel: () => void;
}) {
  const [codes, setCodes] = useState(initial.amenities.map((row) => row.code)),
    [invalid, setInvalid] = useState(false);
  const choices = new Map(catalog.map((row) => [row.code, { ...row, isActive: true }]));
  for (const row of initial.amenities) choices.set(row.code, row);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || pending || !initial.canEdit) return;
    const parsed = roomAmenitiesInputSchema.safeParse({ amenityCodes: [...codes].sort() });
    if (!parsed.success) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onSave(parsed.data);
  }
  return (
    <form aria-label="Room-type amenity selection" onSubmit={submit} className="space-y-4">
      <fieldset disabled={disabled || pending || !initial.canEdit} className="space-y-3">
        <legend className="font-semibold">Approved room-type amenities</legend>
        {[...choices.values()].map((row) => (
          <label key={row.code} className="flex gap-2">
            <input
              type="checkbox"
              checked={codes.includes(row.code)}
              disabled={!row.isActive && !codes.includes(row.code)}
              onChange={(event) =>
                setCodes((current) =>
                  event.target.checked
                    ? [...current, row.code]
                    : current.filter((code) => code !== row.code),
                )
              }
            />
            {row.name}
            {row.isActive ? '' : ' — Retired; may be removed'}
          </label>
        ))}
        {!choices.size ? <p>No approved amenities are available on the loaded pages.</p> : null}
        <p>
          Only this room type’s amenity selection changes. Pricing and fees use their separate
          editor.
        </p>
        {invalid ? <p role="alert">Choose at most 100 distinct approved amenities.</p> : null}
        <Button type="submit">Save room amenities</Button>
      </fieldset>
      <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>
        Cancel room amenity edit
      </Button>
    </form>
  );
}
