'use client';
import type { Dispatch, SetStateAction } from 'react';
import { PrivateFileInput } from './private-file-input';
export type StaffPaymentProofState = {
  attached: boolean;
  busy: boolean;
  fileId: string | undefined;
};
export function StaffPaymentProof({
  id,
  value,
  onChange,
}: {
  id: string;
  value: StaffPaymentProofState;
  onChange: Dispatch<SetStateAction<StaffPaymentProofState>>;
}) {
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value.attached}
          disabled={value.busy}
          onChange={(event) => {
            const attached = event.target.checked;
            onChange((current) => ({ ...current, attached, fileId: undefined }));
          }}
        />
        Attach a private proof (optional)
      </label>
      {value.attached ? (
        <PrivateFileInput
          id={id}
          label="Direct payment proof"
          purpose="payment_proof"
          onReady={(fileId) => onChange((current) => ({ ...current, fileId }))}
          onBusy={(busy) => onChange((current) => ({ ...current, busy }))}
        />
      ) : null}
      {value.attached && !value.fileId ? (
        <p>
          Choose a proof and wait for its clean scan before reviewing, or remove the attachment
          choice.
        </p>
      ) : null}
    </div>
  );
}
