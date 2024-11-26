'use client';
import { useState } from 'react';
import { createStaffAgreement, staffAgreementFile } from '@hsm/api-client';
import type { StaffDetail } from '@hsm/contracts';
import { browserClient } from '../../lib/client';
import { karachiToday } from '../../lib/karachi-time';
import { errorMessage } from '../../lib/messages';
import { PrivateFileInput } from '../private-file-input';
import { Button } from '../ui/button';
import { pkr, useStaffCommand } from './staff-shared';
type Props = { actorId: string; branchId: string; detail: StaffDetail };
// CHG-039: versioned staff agreements. Text and scans need payroll access; older versions stay
// read-only. A scanned copy is a private file behind a short-lived signed URL, not proof of a
// digital signature.
export function StaffAgreements(props: Props) {
  const { detail } = props;
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string>();
  if (!detail.payroll && !detail.agreements.length) return null;
  async function open(agreementId: string) {
    setError(undefined);
    try {
      const file = await staffAgreementFile(browserClient(), props.branchId, agreementId);
      window.open(file.url, '_blank', 'noopener');
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }
  return (
    <section
      aria-label="Agreement"
      className="space-y-2 rounded-input border border-hsm-border p-4"
    >
      <h4 className="font-semibold">Agreement</h4>
      {detail.agreements.map((a, index) => (
        <div key={a.id} className={index ? 'space-y-1 opacity-70' : 'space-y-1'}>
          <p className="font-semibold">
            {a.title} · v{a.version} · from {a.effectiveOn}
            {index ? ' (old)' : ''}
          </p>
          {a.body ? <p className="whitespace-pre-wrap">{a.body}</p> : null}
          {a.hasFile ? (
            <Button variant="ghost" onClick={() => void open(a.id)}>
              {'Open scanned copy of ' + a.title}
            </Button>
          ) : null}
        </div>
      ))}
      {error ? <p role="alert">{error}</p> : null}
      {detail.payroll ? (
        adding ? (
          <NewAgreement {...props} close={() => setAdding(false)} />
        ) : (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            {detail.agreements.length ? 'New version' : 'Add agreement'}
          </Button>
        )
      ) : null}
    </section>
  );
}
function NewAgreement(props: Props & { close: () => void }) {
  const { detail } = props;
  const terms = detail.terms[0];
  const [title, setTitle] = useState('Employment agreement');
  const [body, setBody] = useState(
    terms ? 'Monthly salary ' + pkr(terms.amountPaisa) + ', paid on day ' + terms.dueDay + '.' : '',
  );
  const [effectiveOn, setEffective] = useState(() => karachiToday());
  const [fileId, setFileId] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const save = useStaffCommand<Record<string, unknown>>(
    'staff-agreement:' + detail.staff.id,
    props.actorId,
    props.branchId,
    (client, input, key) =>
      createStaffAgreement(client, props.branchId, detail.staff.id, input, key),
  );
  return (
    <div className="space-y-2">
      <label className="field-label">
        Title
        <input
          className="field-input"
          value={title}
          maxLength={120}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label className="field-label">
        Terms
        <textarea
          className="field-input min-h-24"
          value={body}
          maxLength={5000}
          onChange={(event) => setBody(event.target.value)}
        />
      </label>
      <label className="field-label">
        Effective date
        <input
          className="field-input"
          type="date"
          value={effectiveOn}
          onChange={(event) => setEffective(event.target.value)}
        />
      </label>
      <PrivateFileInput
        id={'staff-agreement-' + detail.staff.id}
        label="Scanned copy (optional)"
        purpose="staff_agreement"
        onReady={setFileId}
        onBusy={setUploading}
      />
      {save.isError ? <p role="alert">{errorMessage(save.error)}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={save.isPending || uploading}
          onClick={() =>
            save.mutate(
              {
                title: title.trim(),
                body: body.trim(),
                effectiveOn,
                ...(fileId ? { fileId } : {}),
              },
              { onSuccess: props.close },
            )
          }
        >
          {save.isPending ? 'Saving…' : 'Save agreement'}
        </Button>
        <Button variant="secondary" onClick={props.close}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
