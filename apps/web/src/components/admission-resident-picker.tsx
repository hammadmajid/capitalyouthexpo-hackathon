'use client';
import { useState } from 'react';
import type { ManualStayInput } from '@hsm/contracts';
import { AdmissionNewResident } from './admission-new-resident';
import { AdmissionExistingResident } from './admission-existing-resident';
import { Button } from './ui/button';
type Props = {
  actorId: string;
  branchId: string;
  branchLabel: string;
  pending: boolean;
  unavailable: boolean;
  onChoose: (resident: ManualStayInput['resident'], label: string, cnicPhoto?: string) => void;
  onCancel: () => void;
};
export function AdmissionResidentPicker(props: Props) {
  if (props.unavailable)
    return <p role="alert">Refresh branch access before selecting a resident.</p>;
  return <Picker key={props.actorId + ':' + props.branchId} {...props} />;
}
function Picker(props: Props) {
  const [mode, setMode] = useState<'new' | 'existing'>();
  return (
    <section aria-label="Choose admission resident" className="space-y-4">
      <h3 className="text-lg font-semibold">Resident for {props.branchLabel}</h3>
      <div role="group" aria-label="Resident relationship" className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          aria-pressed={mode === 'new'}
          disabled={props.pending}
          onClick={() => setMode('new')}
        >
          New offline resident
        </Button>
        <Button
          variant="secondary"
          aria-pressed={mode === 'existing'}
          disabled={props.pending}
          onClick={() => setMode('existing')}
        >
          Existing branch resident
        </Button>
      </div>
      {mode === 'new' ? (
        <AdmissionNewResident disabled={props.pending} onChoose={props.onChoose} />
      ) : null}
      {mode === 'existing' ? (
        <AdmissionExistingResident
          actorId={props.actorId}
          branchId={props.branchId}
          disabled={props.pending}
          onChoose={props.onChoose}
        />
      ) : null}
      <Button variant="ghost" disabled={props.pending} onClick={props.onCancel}>
        Cancel resident selection
      </Button>
    </section>
  );
}
