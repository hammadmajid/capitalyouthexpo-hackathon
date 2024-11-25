'use client';
import { useState, type Dispatch, type SetStateAction } from 'react';
import { useQuery } from '@tanstack/react-query';
import { readBillingSettings, saveAgreementTemplate } from '@hsm/api-client';
import { agreementTemplateSchema, type AgreementTemplateInput } from '@hsm/contracts';
import { browserClient } from '../../lib/client';
import { errorMessage } from '../../lib/messages';
import { PrivateFileInput } from '../private-file-input';
import { useCommand } from '../services/use-command';
import { Button } from '../ui/button';
type Edit = { base: string; title: string; text: string; fileId: string | null };
type Props = { actorId: string; branchId: string };
// STAY-002: the branch agreement template is part of the versioned billing policy. Saving it
// creates a new policy version for future stays; agreements already made keep their own copy.
function useAgreementTemplate(actorId: string, branchId: string) {
  const query = useQuery({
    queryKey: ['billing-policy', actorId, branchId, 'branch'],
    retry: false,
    queryFn: () => readBillingSettings(browserClient(), { branchId }),
  });
  const command = useCommand<AgreementTemplateInput>(
    'agreement-template:' + branchId,
    (body, key) => saveAgreementTemplate(browserClient(), branchId, body, key),
    [
      ['billing-policy', actorId, branchId],
      ['setup-progress', 'policy', branchId],
    ],
  );
  const current = query.data?.effectiveVersion ?? undefined;
  return { query, command, current, template: current?.policy.agreementTemplate };
}
export function AgreementTemplate({ actorId, branchId }: Props) {
  const [editing, setEditing] = useState<Edit>(),
    [uploading, setUploading] = useState(false),
    [message, setMessage] = useState('');
  const { query, command, current, template } = useAgreementTemplate(actorId, branchId);
  const editable = query.data?.canEdit === true,
    busy = uploading || command.isPending || command.unresolved,
    // A newer policy version saved elsewhere must be reviewed before this edit can apply.
    conflict = Boolean(editing && current && editing.base !== current.id);
  function save(remove: boolean) {
    if (!editing || busy || conflict) return;
    const parsed = agreementTemplateSchema.safeParse({
      title: editing.title,
      text: editing.text,
      fileId: editing.fileId,
    });
    if (!remove && !parsed.success) {
      setMessage('Add a title and agreement terms or document.');
      return;
    }
    command.mutate(
      { policyVersionId: editing.base, template: remove ? null : (parsed.data ?? null) },
      {
        onSuccess: () => {
          setEditing(undefined);
          setMessage('Agreement version saved.');
        },
      },
    );
  }
  return (
    <section
      aria-label="Agreement template"
      className="space-y-3 rounded-input border border-hsm-border p-4"
    >
      <h4 className="font-semibold">Agreement</h4>
      <p className="text-sm text-hsm-secondary">Template for new stays</p>
      {query.isPending ? <p role="status">Loading agreement template…</p> : null}
      {(query.error ?? command.error) ? (
        <p role="alert">{errorMessage(query.error ?? command.error)}</p>
      ) : null}
      {command.unresolved && !command.isPending ? (
        <Button onClick={() => command.retryOriginal()}>Retry agreement save</Button>
      ) : null}
      {query.isSuccess && !current ? <p>Save a rent policy first.</p> : null}
      {current && !editing ? (
        <div className="space-y-1">
          <p className="font-semibold">{template?.title ?? 'No agreement template'}</p>
          {template?.text ? <p className="line-clamp-3 text-sm">{template.text}</p> : null}
          {template?.fileId ? <p className="text-sm">Document attached</p> : null}
          {editable ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setMessage('');
                setEditing({
                  base: current.id,
                  title: template?.title ?? '',
                  text: template?.text ?? '',
                  fileId: template?.fileId ?? null,
                });
              }}
            >
              Edit agreement template
            </Button>
          ) : null}
        </div>
      ) : null}
      {editing && editable ? (
        <TemplateForm
          editing={editing}
          change={setEditing}
          busy={busy}
          conflict={conflict}
          hasTemplate={Boolean(template)}
          uploading={setUploading}
          save={save}
          cancel={() => setEditing(undefined)}
        />
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
function TemplateForm(props: {
  editing: Edit;
  change: Dispatch<SetStateAction<Edit | undefined>>;
  busy: boolean;
  conflict: boolean;
  hasTemplate: boolean;
  uploading: (busy: boolean) => void;
  save: (remove: boolean) => void;
  cancel: () => void;
}) {
  const { editing, change, busy } = props;
  return (
    <div className="space-y-3">
      <label className="field-label">
        Agreement title
        <input
          className="field-input"
          value={editing.title}
          maxLength={120}
          onChange={(event) => change({ ...editing, title: event.target.value })}
        />
      </label>
      <label className="field-label">
        Agreement terms
        <textarea
          className="field-input min-h-28"
          value={editing.text}
          maxLength={12000}
          placeholder="Terms (optional when a document is attached)"
          onChange={(event) => change({ ...editing, text: event.target.value })}
        />
      </label>
      {editing.fileId ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm">Document attached</p>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => change({ ...editing, fileId: null })}
          >
            Remove attached template
          </Button>
        </div>
      ) : (
        <PrivateFileInput
          id="agreement-template-file"
          label="Agreement document"
          purpose="agreement_template"
          disabled={busy}
          onBusy={props.uploading}
          onReady={(fileId) => {
            // Functional update: the title and terms may change while the scan runs.
            if (fileId) change((value) => (value ? { ...value, fileId } : value));
          }}
        />
      )}
      {props.conflict ? <p role="alert">Policy changed. Reopen the editor before saving.</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || props.conflict} onClick={() => props.save(false)}>
          Save agreement
        </Button>
        {props.hasTemplate ? (
          <Button
            variant="secondary"
            disabled={busy || props.conflict}
            onClick={() => props.save(true)}
          >
            Remove future template
          </Button>
        ) : null}
        <Button variant="ghost" disabled={busy} onClick={props.cancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
