import { useState, type FormEvent } from 'react';
import { bookingActionInputSchema } from '@hsm/contracts';
import { MarketplaceButton as Button } from './ui/marketplace-button';
export function CustomerCancellationForm({
  pending,
  disabled,
  onSave,
  onClose,
}: {
  pending: boolean;
  disabled: boolean;
  onSave: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState(''),
    [invalid, setInvalid] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || disabled) return;
    const input = bookingActionInputSchema.safeParse({ reason });
    setInvalid(!input.success);
    if (input.success) onSave(input.data.reason);
  }
  return (
    <form onSubmit={submit}>
      <fieldset disabled={pending || disabled} className="space-y-3">
        <legend>Cancel your booking</legend>
        <label className="field-label">
          Cancellation reason
          <textarea
            className="field-input"
            value={reason}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            required
          />
        </label>
        <p>The server applies your agreed cancellation policy.</p>
        {invalid ? <p role="alert">Enter a cancellation reason.</p> : null}
        <div className="flex gap-3">
          <Button type="submit">
            {pending ? 'Requesting cancellation…' : 'Confirm cancellation'}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Keep booking
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
