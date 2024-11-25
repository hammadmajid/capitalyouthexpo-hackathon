'use client';
import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  attachAgreementFile,
  readAgreementFiles,
  readAgreementFileUrl,
  type AgreementDocumentTarget,
} from '@hsm/api-client';
import { agreementFileInputSchema, type AgreementFileInput } from '@hsm/contracts';
import { browserClient } from '../../lib/client';
import { errorMessage } from '../../lib/messages';
import { PrivateFileInput } from '../private-file-input';
import { useCommand } from '../services/use-command';
import { Button } from '../ui/button';
type Props = {
  actorId: string;
  target: AgreementDocumentTarget;
  templateFileId?: string | null | undefined;
};
// STAY-002: signed agreement scans are private files, opened only through a short-lived signed
// URL after the server checks access. A scan is a record, not proof of a digital signature.
export function AgreementDocuments({ actorId, target, templateFileId }: Props) {
  const [opening, setOpening] = useState(false),
    [message, setMessage] = useState('');
  const key = [
    'agreement-files',
    actorId,
    target.branchId ?? 'own',
    target.stayId,
    target.agreementId,
  ];
  const query = useInfiniteQuery({
    queryKey: key,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      readAgreementFiles(browserClient(), target, {
        limit: 20,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = query.data?.pages.flatMap((page) => page.data) ?? [];
  async function view(file: string) {
    if (opening) return;
    setOpening(true);
    setMessage('');
    try {
      const result = await readAgreementFileUrl(browserClient(), target, file);
      window.open(result.url, '_blank', 'noopener');
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setOpening(false);
    }
  }
  return (
    <section aria-label="Agreement documents" className="space-y-2">
      <h5 className="font-semibold">Agreement documents</h5>
      {query.isPending ? <p role="status">Loading agreement documents…</p> : null}
      {query.error ? <p role="alert">{errorMessage(query.error)}</p> : null}
      <div className="flex flex-wrap gap-2">
        {templateFileId ? (
          <Button variant="secondary" disabled={opening} onClick={() => void view(templateFileId)}>
            Open original template document
          </Button>
        ) : null}
        {rows.map((row) => (
          <Button
            key={row.id}
            variant="secondary"
            disabled={opening}
            onClick={() => void view(row.fileId)}
          >
            {row.label}
          </Button>
        ))}
      </div>
      {query.isSuccess && rows.length === 0 ? <p>No agreement scans yet.</p> : null}
      {query.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          More agreement scans
        </Button>
      ) : null}
      <ScanUpload target={target} refresh={key} />
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
function ScanUpload({ target, refresh }: { target: AgreementDocumentTarget; refresh: string[] }) {
  const [fileId, setFileId] = useState<string>(),
    [label, setLabel] = useState('Agreement scan'),
    [uploading, setUploading] = useState(false),
    [message, setMessage] = useState('');
  const command = useCommand<AgreementFileInput>(
    'agreement-file:' + target.agreementId,
    (input, commandKey) => attachAgreementFile(browserClient(), target, input, commandKey),
    [refresh],
  );
  const busy = uploading || command.isPending || command.unresolved;
  function save() {
    const input = agreementFileInputSchema.safeParse({ fileId, label });
    if (!input.success || busy) {
      setMessage('Choose a checked document and enter its name.');
      return;
    }
    command.mutate(input.data, {
      onSuccess: () => {
        setFileId(undefined);
        setMessage('Agreement scan saved.');
      },
    });
  }
  return (
    <div className="space-y-2">
      <PrivateFileInput
        id={'agreement-scan-' + target.agreementId}
        label="Add agreement scan"
        purpose="stay_agreement"
        disabled={busy}
        onBusy={setUploading}
        onReady={setFileId}
      />
      {fileId ? (
        <>
          <label className="field-label">
            Agreement scan name
            <input
              className="field-input"
              value={label}
              maxLength={120}
              onChange={(event) => setLabel(event.target.value)}
            />
          </label>
          <Button disabled={busy} onClick={save}>
            Save agreement scan
          </Button>
        </>
      ) : null}
      {command.error ? <p role="alert">{errorMessage(command.error)}</p> : null}
      {command.unresolved && !command.isPending ? (
        <Button onClick={() => command.retryOriginal()}>Retry agreement scan</Button>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}
