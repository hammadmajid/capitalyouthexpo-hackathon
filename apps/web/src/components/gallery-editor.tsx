import { useId, useState, type FormEvent } from 'react';
import {
  galleryArchiveSchema,
  galleryAttachSchema,
  galleryEditSchema,
  type GalleryMedia,
} from '@hsm/contracts';
import type { GalleryCommand } from './use-listing-gallery';
import { PrivateFileInput } from './private-file-input';
import { Button } from './ui/button';
export type GalleryEditorState =
  { kind: 'attach' } | { kind: 'edit' | 'archive' | 'cover'; initial: GalleryMedia };
export function GalleryEditor({
  state,
  disabled,
  canPublish,
  pending,
  onSave,
  onCancel,
}: {
  state: GalleryEditorState;
  disabled: boolean;
  canPublish: boolean;
  pending: boolean;
  onSave: (command: GalleryCommand) => void;
  onCancel: () => void;
}) {
  const uploadId = useId();
  const initial = state.kind === 'attach' ? undefined : state.initial;
  const [altText, setAltText] = useState(initial?.altText ?? ''),
    [order, setOrder] = useState(initial ? String(initial.sortOrder) : ''),
    [published, setPublished] = useState(Boolean(initial?.publishedAt)),
    [fileId, setFileId] = useState<string>(),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState(''),
    [invalid, setInvalid] = useState(false);
  const publicationAction =
    state.kind === 'cover' || Boolean(initial?.publishedAt) || (state.kind === 'edit' && published);
  const restricted = publicationAction && !canPublish;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || pending || busy || restricted) return;
    try {
      let command: GalleryCommand;
      if (state.kind === 'cover') command = { kind: 'cover', initial: state.initial };
      else if (state.kind === 'archive')
        command = {
          kind: 'archive',
          initial: state.initial,
          reason: galleryArchiveSchema.parse({ reason }).reason,
        };
      else {
        if (!/^(0|[1-9][0-9]*)$/.test(order)) throw new Error('Invalid order');
        command =
          state.kind === 'attach'
            ? {
                kind: 'attach',
                input: galleryAttachSchema.parse({ fileId, altText, sortOrder: Number(order) }),
              }
            : {
                kind: 'edit',
                initial: state.initial,
                input: galleryEditSchema.parse({ altText, sortOrder: Number(order), published }),
              };
      }
      setInvalid(false);
      onSave(command);
    } catch {
      setInvalid(true);
    }
  }
  return (
    <form aria-label="Gallery image action" className="space-y-4" onSubmit={submit}>
      {restricted ? (
        <p role="alert">
          Publication permission is required for this image action. Your draft is retained.
        </p>
      ) : null}
      <fieldset disabled={disabled || pending || restricted} className="space-y-4">
        <legend className="font-semibold">
          {state.kind === 'attach'
            ? 'Attach a private image'
            : state.kind === 'edit'
              ? 'Edit image and publication'
              : state.kind === 'archive'
                ? 'Archive image'
                : 'Choose cover image'}
        </legend>
        {state.kind === 'attach' ? (
          <PrivateFileInput
            label="Listing image"
            id={'gallery-image-' + uploadId}
            purpose="listing_photo"
            onReady={setFileId}
            onBusy={setBusy}
          />
        ) : null}
        {state.kind === 'attach' || state.kind === 'edit' ? (
          <>
            <label className="block">
              Image description
              <input
                className="field-input"
                value={altText}
                maxLength={240}
                onChange={(event) => setAltText(event.target.value)}
              />
            </label>
            <label className="block">
              Image display order
              <input
                className="field-input"
                inputMode="numeric"
                value={order}
                onChange={(event) => setOrder(event.target.value)}
              />
            </label>
          </>
        ) : null}
        {state.kind === 'attach' ? (
          <p>
            Attachment keeps the image private. Enable publication separately after reviewing it.
          </p>
        ) : null}
        {state.kind === 'edit' ? (
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={published}
              disabled={!canPublish}
              onChange={(event) => setPublished(event.target.checked)}
            />
            Enable marketplace image publication
          </label>
        ) : null}
        {state.kind === 'archive' ? (
          <label className="block">
            Reason for archiving
            <textarea
              className="field-input"
              value={reason}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
        ) : null}
        {state.kind === 'cover' ? (
          <p>Move this image first. This action does not enable publication.</p>
        ) : null}
        <p>
          Public visibility also requires current branch approval, visibility and a clean image
          scan.
        </p>
        {invalid ? (
          <p role="alert">
            Check the image description, integer order, clean upload or archival reason before
            saving.
          </p>
        ) : null}
        <Button type="submit" disabled={busy || (state.kind === 'attach' && !fileId)}>
          Save image action
        </Button>
      </fieldset>
      <Button type="button" variant="secondary" disabled={pending || busy} onClick={onCancel}>
        Cancel image action
      </Button>
    </form>
  );
}
