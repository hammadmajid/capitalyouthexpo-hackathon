import { useState, type FormEvent } from 'react';
import { stayRangeSchema, type StayRange } from '@hsm/contracts';
import { Button } from './ui/button';
export function PublicInventoryDateFilter({
  busy,
  onApply,
}: {
  busy: boolean;
  onApply: (range: StayRange | undefined) => void;
}) {
  const [start, setStart] = useState(''),
    [end, setEnd] = useState(''),
    [invalid, setInvalid] = useState(false);
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const value = stayRangeSchema.safeParse({ moveInDate: start, moveOutDate: end });
    setInvalid(!value.success);
    if (value.success) onApply(value.data);
  }
  return (
    <form onSubmit={apply}>
      <fieldset disabled={busy} className="space-y-3">
        <legend className="font-semibold">Check availability for your dates</legend>
        <label className="field-label">
          Availability move-in
          <input
            className="field-input"
            type="date"
            value={start}
            onChange={(event) => setStart(event.target.value)}
          />
        </label>
        <label className="field-label">
          Availability move-out
          <input
            className="field-input"
            type="date"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
          />
        </label>
        {invalid ? (
          <p role="alert">Choose a valid complete stay range. The end date is excluded.</p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button type="submit">Apply availability dates</Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              if (!busy) {
                setStart('');
                setEnd('');
                setInvalid(false);
                onApply(undefined);
              }
            }}
          >
            Clear availability dates
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
