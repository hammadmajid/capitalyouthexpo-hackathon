'use client';
import { useState } from 'react';
import { z } from 'zod';
import { uploadSchema, type Upload } from '@hsm/contracts';
import { uploadPrivateFile, waitForCleanFile, UploadFailure } from '@hsm/api-client';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
export function PrivateFileInput({
  label,
  purpose,
  id,
  onReady,
  onBusy,
  onPending,
  disabled = false,
}: {
  label: string;
  purpose: Upload['purpose'];
  disabled?: boolean;
  id: string;
  onReady: (fileId: string | undefined) => void;
  onBusy?: (busy: boolean) => void;
  onPending?: (pending: boolean) => void;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState<string>();
  const [pending, setPending] = useState<{ fileId: string; upload: Upload }>();
  const imageOnly = purpose === 'avatar' || purpose === 'listing_photo';
  async function run(file?: File) {
    if (busy || disabled) return;
    setBusy(true);
    onBusy?.(true);
    setMessage(undefined);
    onPending?.(false);
    onReady(undefined);
    let upload: Upload | undefined;
    try {
      let fileId: string;
      if (file) {
        upload = uploadSchema.parse({
          purpose,
          fileName: file.name,
          mimeType: purpose === 'import' ? 'text/csv' : file.type,
          sizeBytes: file.size,
        });
        setPending(undefined);
        fileId = await uploadPrivateFile(browserClient(), upload, file);
      } else if (pending) {
        upload = pending.upload;
        fileId = await waitForCleanFile(browserClient(), pending.fileId, upload);
      } else return;
      setPending(undefined);
      onReady(fileId);
      setMessage('File checked and ready.');
    } catch (error) {
      if (error instanceof UploadFailure && error.code === 'PENDING' && upload) {
        onPending?.(true);
        setPending({ fileId: error.fileId, upload });
        setMessage('Scanning is still in progress. Check again shortly.');
      } else {
        setPending(undefined);
        setMessage(
          error instanceof UploadFailure
            ? 'The file was rejected. Choose another file.'
            : error instanceof z.ZodError
              ? 'Choose a supported file within the size limit.'
              : errorMessage(error),
        );
      }
    } finally {
      setBusy(false);
      onBusy?.(false);
    }
  }
  return (
    <div className="space-y-3">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="field-input"
        type="file"
        disabled={busy || disabled}
        accept={
          purpose === 'import'
            ? 'text/csv'
            : imageOnly
              ? 'image/jpeg,image/png,image/webp'
              : 'image/jpeg,image/png,application/pdf'
        }
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void run(file);
        }}
      />
      <p className="text-sm">
        Private upload.{' '}
        {purpose === 'import'
          ? 'UTF-8 CSV up to 5 MB.'
          : imageOnly
            ? 'Images up to 8 MB.'
            : 'JPEG, PNG or PDF up to 10 MB.'}
      </p>
      {/* Screen-reader only; no visible "Uploading" line (user request). */}
      {busy ? (
        <p role="status" className="sr-only">
          Uploading
        </p>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
      {pending ? (
        <Button variant="secondary" disabled={busy || disabled} onClick={() => void run()}>
          Check scan status
        </Button>
      ) : null}
    </div>
  );
}
