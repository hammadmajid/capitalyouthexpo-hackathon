'use client';
import { useState } from 'react';
import type { BedRentInput } from '@hsm/contracts';
import { karachiToday } from '../lib/karachi-time';
import { Button } from './ui/button';
import { GroupedNumberInput } from './ui/grouped-number-input';
type Props = {
  initial: { rent: string; security: string };
  busy: boolean;
  parse: (rent: string, security: string, effectiveFrom: string) => BedRentInput;
  onSave: (input: BedRentInput) => void;
  onCancel: () => void;
};
// CHG-058: security sits beside each bed's rent; dates are Pakistan calendar days.
export function BedRentEditor({ initial, busy, parse, onSave, onCancel }: Props) {
  const [rent, setRent] = useState(initial.rent),
    [security, setSecurity] = useState(initial.security),
    [date, setDate] = useState(() => karachiToday()),
    [invalid, setInvalid] = useState(false);
  function save() {
    try {
      const input = parse(rent, security, date);
      setInvalid(false);
      onSave(input);
    } catch {
      setInvalid(true);
    }
  }
  return (
    <div className="space-y-2">
      <label className="field-label">
        Monthly rent for this bed (PKR)
        <GroupedNumberInput
          className="field-input"
          value={rent}
          onValueChange={setRent}
          disabled={busy}
        />
      </label>
      <label className="field-label">
        Security deposit for this bed (PKR)
        <GroupedNumberInput
          className="field-input"
          value={security}
          onValueChange={setSecurity}
          disabled={busy}
        />
      </label>
      <label className="field-label">
        Effective from
        <input
          className="field-input"
          type="date"
          value={date}
          disabled={busy}
          onChange={(event) => setDate(event.target.value)}
        />
      </label>
      <p>Existing residents keep their agreed amounts.</p>
      {invalid ? <p role="alert">Enter rent and security in rupees.</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !rent.trim() || !date} onClick={save}>
          Save pricing
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
