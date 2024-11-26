import { FileUp, ImagePlus, Pencil, ImageUp, Trash2 } from 'lucide-react-native';
import { PropertyActionDialog, PropertyActionRow } from './property-action-dialog';
import { PhotoPickerPreview } from './photo-picker-preview';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { mobileColors as colors, spacing } from '@hsm/ui';
import { z } from 'zod';
import { waitForCleanFile, UploadFailure } from '@hsm/api-client';
import { uploadSelectedDocument, PendingDocumentUpload } from '../lib/private-file';
import { client, actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { withFreshSession } from '../lib/fresh-session';
import { Button, Copy } from './ui';
export function PrivateFilePicker(props: {
  imagesOnly?: boolean;
  autoOpen?: boolean;
  fileId?: string | undefined;
  preview?: boolean;
  overlay?: boolean;
  retainSelection?: boolean;
  hideLabel?: boolean;
  // The caller states the file rule once when several pickers share it.
  hideHint?: boolean;
  label: string;
  actorId?: string;
  purpose:
    | 'avatar'
    | 'verification_document'
    | 'listing_photo'
    | 'resident_document'
    | 'agreement_template'
    | 'stay_agreement'
    | 'payment_proof'
    | 'chat_attachment'
    | 'complaint_attachment'
    | 'staff_agreement'
    | 'import';
  onReady: (fileId: string | undefined) => void;
  onBusy: (busy: boolean) => void;
  onPending?: (pending: boolean) => void;
  disabled?: boolean;
  Action?: typeof Button;
}) {
  const {
    label,
    actorId,
    purpose,
    onReady,
    onBusy,
    onPending,
    disabled = false,
    Action = Button,
    hideLabel = false,
    hideHint = false,
    fileId: suppliedFileId,
    preview = true,
    retainSelection = true,
    overlay = false,
    imagesOnly = false,
    autoOpen = false,
  } = props;
  const [selectedId, setSelectedId] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [image, setImage] = useState(
    imagesOnly || purpose === 'avatar' || purpose === 'listing_photo',
  );
  const selected = Object.hasOwn(props, 'fileId') ? suppliedFileId : selectedId;
  const photo = imagesOnly || purpose === 'avatar' || purpose === 'listing_photo';
  const started = useRef(false);
  useEffect(() => {
    if (autoOpen && !disabled && !started.current) {
      started.current = true;
      void run();
    }
  }, [autoOpen, disabled]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState<PendingDocumentUpload>();
  async function run(resume = false) {
    setEditing(false);
    setBusy(true);
    onBusy(true);
    setMessage(undefined);
    try {
      const scopedClient =
        actorId === undefined ? client : await withFreshSession(() => actorClient(actorId));
      let fileId: string | undefined;
      if (resume && pending) {
        fileId = await waitForCleanFile(scopedClient, pending.fileId, pending.upload);
      } else {
        const onSelected = (_uri: string, mimeType?: string) => {
          setImage(photo || Boolean(mimeType?.startsWith('image/')));
          // Keep an existing selection until its replacement passes the scan.
          if (!selected || !photo) {
            onReady(undefined);
            if (!photo) setSelectedId(undefined);
          }
          setPending(undefined);
          onPending?.(false);
        };
        fileId = imagesOnly
          ? await uploadSelectedDocument(scopedClient, purpose, onSelected, { imagesOnly: true })
          : await uploadSelectedDocument(scopedClient, purpose, onSelected);
      }
      if (fileId) {
        if (retainSelection) setSelectedId(fileId);
        onReady(fileId);
        setPending(undefined);
        onPending?.(false);
        // Photos show themselves once saved, so only documents get a "ready" line.
        if (purpose !== 'avatar' && purpose !== 'listing_photo' && purpose !== 'payment_proof')
          setMessage('File checked and ready.');
      }
    } catch (error) {
      if (error instanceof PendingDocumentUpload) {
        onPending?.(true);
        setPending(error);
        setMessage('Scanning is still in progress. Check again shortly.');
      } else if (error instanceof UploadFailure && error.code === 'PENDING' && pending) {
        onPending?.(true);
        setMessage('Scanning is still in progress. Check again shortly.');
      } else {
        setPending(undefined);
        onPending?.(false);
        if (!selected) onReady(undefined);
        setMessage(
          error instanceof UploadFailure
            ? 'The file was rejected. Choose another file.'
            : error instanceof z.ZodError
              ? error.issues.some((issue) => issue.path[0] === 'sizeBytes') &&
                (purpose === 'avatar' || purpose === 'listing_photo')
                ? 'Choose a photo up to 5 MB.'
                : 'Choose a supported file within the size limit.'
              : safeMessage(error),
        );
      }
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <View
      className="gap-3"
      style={
        overlay
          ? { position: 'absolute', top: 0, right: 0, width: spacing.touch, height: spacing.touch }
          : undefined
      }
    >
      {hideLabel ? null : <Copy>{label}</Copy>}
      {hideHint ? null : (
        <Copy>
          {purpose === 'import'
            ? 'Private UTF-8 CSV up to 5 MB.'
            : purpose === 'avatar' || purpose === 'listing_photo'
              ? 'Private image up to 5 MB.'
              : 'Photo up to 5 MB, or PDF up to 10 MB.'}
        </Copy>
      )}
      {selected && preview ? (
        <PhotoPickerPreview
          actorId={actorId}
          fileId={selected}
          label={label}
          image={image}
          disabled={busy || disabled}
          edit={() => setEditing(true)}
        />
      ) : (
        <Action
          label={(selected ? 'Edit ' : 'Choose ') + label}
          Icon={selected ? Pencil : photo ? ImagePlus : FileUp}
          secondary
          disabled={busy || disabled}
          onPress={() => {
            if (selected) setEditing(true);
            else void run();
          }}
        />
      )}
      <PropertyActionDialog
        title={label}
        visible={editing}
        busy={busy || disabled}
        close={() => setEditing(false)}
      >
        <PropertyActionRow
          label={'Replace ' + label}
          Icon={ImageUp}
          disabled={busy || disabled}
          onPress={() => void run()}
        />
        <PropertyActionRow
          label={'Delete ' + label}
          Icon={Trash2}
          danger
          disabled={busy || disabled}
          onPress={() => {
            setEditing(false);
            setSelectedId(undefined);
            setPending(undefined);
            setMessage(undefined);
            onPending?.(false);
            onReady(undefined);
          }}
        />
      </PropertyActionDialog>
      {/* A quiet spinner while the file uploads; no extra line of text (user request). */}
      {busy ? (
        <ActivityIndicator
          accessibilityLabel="Uploading"
          color={colors.primary}
          style={{ alignSelf: 'flex-start' }}
        />
      ) : null}
      {message ? <Copy>{message}</Copy> : null}
      {pending ? (
        <Action
          label={'Check scan status for ' + label}
          secondary
          disabled={busy || disabled}
          onPress={() => {
            void run(true);
          }}
        />
      ) : null}
    </View>
  );
}
