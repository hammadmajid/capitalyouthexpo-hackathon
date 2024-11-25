import { useState } from 'react';
import Image from 'next/image';
import type { GalleryMedia } from '@hsm/contracts';
import type { GalleryEditorState } from './gallery-editor';
import { Button } from './ui/button';
export function GalleryImageCard({
  image,
  canEdit,
  canPublish,
  disabled,
  onAction,
}: {
  image: GalleryMedia;
  canEdit: boolean;
  canPublish: boolean;
  disabled: boolean;
  onAction: (state: GalleryEditorState) => void;
}) {
  const editable = canEdit && (image.publishedAt === null || canPublish);
  const [failed, setFailed] = useState(false);
  const preview =
    image.publishedAt !== null && image.archivedAt === null && image.scanStatus === 'clean';
  return (
    <article className="space-y-3 rounded-panel border border-hsm-border p-4">
      <h3 className="font-semibold">{image.altText}</h3>
      {preview && !failed ? (
        <Image
          unoptimized
          width={480}
          height={320}
          className="h-48 w-full rounded-input object-cover"
          src={'/api/v1/marketplace/media/' + image.id}
          alt={image.altText}
          onError={() => setFailed(true)}
        />
      ) : (
        <p>
          {preview
            ? 'Public preview is currently unavailable.'
            : image.publishedAt === null
              ? 'Private draft; no public preview.'
              : 'Public preview is unavailable in this image state.'}
        </p>
      )}
      <p>
        Image order: {image.sortOrder}. Scan: {image.scanStatus}.
      </p>
      <p>
        {image.publishedAt
          ? 'Publication enabled; current public eligibility is checked separately.'
          : 'Private draft; publication is disabled.'}
      </p>
      {image.archivedAt ? <p>Archived image. Its history is retained.</p> : null}
      {canEdit && !image.archivedAt ? (
        <div className="flex flex-wrap gap-3">
          {editable ? (
            <Button disabled={disabled} onClick={() => onAction({ kind: 'edit', initial: image })}>
              Edit image publication
            </Button>
          ) : null}
          {canPublish ? (
            <Button
              variant="secondary"
              disabled={disabled || image.scanStatus !== 'clean'}
              onClick={() => onAction({ kind: 'cover', initial: image })}
            >
              Choose as cover
            </Button>
          ) : null}
          {editable ? (
            <Button
              variant="secondary"
              disabled={disabled}
              onClick={() => onAction({ kind: 'archive', initial: image })}
            >
              Archive image
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
