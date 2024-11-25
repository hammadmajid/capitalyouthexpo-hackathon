'use client';
import type { ManualAdmissionCommand } from '@hsm/contracts';
import { Button } from './ui/button';
export function AdmissionConfirmation({
  command,
  pending,
  uncertain,
  confirmed,
  onConfirm,
  onAdmit,
  onEdit,
}: {
  command: ManualAdmissionCommand;
  pending: boolean;
  uncertain: boolean;
  confirmed: boolean;
  onConfirm: (value: boolean) => void;
  onAdmit: (command: ManualAdmissionCommand) => void;
  onEdit: () => void;
}) {
  return (
    <div className="space-y-3">
      <p>
        Initial charges and future schedules will be created with the agreed terms. No payment or
        receipt is recorded by this action.
      </p>
      {uncertain ? (
        <p role="status">
          The admission result has not been confirmed. Retry the same admission to resolve its
          outcome.
        </p>
      ) : null}
      <label className="flex min-h-12 items-start gap-3">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={pending || uncertain}
          onChange={(event) => onConfirm(event.target.checked)}
        />
        <span>I confirm the agreed terms and that the resident is being admitted now.</span>
      </label>
      <Button
        disabled={pending || !confirmed}
        onClick={() => {
          if (!pending && confirmed) onAdmit(command);
        }}
      >
        {pending ? 'Admitting…' : uncertain ? 'Retry same admission' : 'Admit resident'}
      </Button>
      <Button variant="secondary" disabled={pending || uncertain} onClick={onEdit}>
        Edit billing periods
      </Button>
    </div>
  );
}
