import { useState } from 'react';
import { Eye, ImageUp, Pencil, Star, Trash2, X } from 'lucide-react-native';
import type { ComponentProps } from 'react';
import { IconChip } from './inventory-tools';
import { Image, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { readOwnFileUrl } from '@hsm/api-client';
import type { GalleryMedia } from '@hsm/contracts';
import { mobileOwnerColors as c, ownerMetrics as m } from '@hsm/ui';
import { actorClient } from '../lib/runtime';
import { withFreshSession } from '../lib/fresh-session';
import { PrivateFilePicker } from './private-file-picker';
import { SetupButton, SetupText, StatusChip } from './owner-wizard-ui';
import { Skeleton } from './loading/skeleton';
import type { MediaCommand } from './owner-media-command';
// The picker's action rendered as a small "Replace" chip.
function ReplaceAction(props: ComponentProps<typeof SetupButton>) {
  return (
    <IconChip
      Icon={ImageUp}
      text="Replace"
      label="Replace photo"
      disabled={props.disabled ?? false}
      onPress={props.onPress}
    />
  );
}
export function OwnerMediaPhoto(props: {
  actorId: string;
  image: GalleryMedia;
  canEdit: boolean;
  canPublish: boolean;
  busy: boolean;
  setUploading: (busy: boolean) => void;
  run: (body: MediaCommand) => void;
  compact?: boolean;
}) {
  const { actorId, image, canEdit, canPublish, busy, run } = props;
  const size = props.compact ? 120 : 140;
  const [editing, setEditing] = useState(false);
  const preview = useQuery({
    queryKey: ['owner-photo-url', actorId, image.fileId],
    enabled: image.scanStatus === 'clean',
    retry: false,
    staleTime: 60_000,
    queryFn: () =>
      withFreshSession(async () => readOwnFileUrl(await actorClient(actorId), image.fileId)),
  });
  const editable = canEdit && (!image.publishedAt || canPublish);
  // Every editable tile keeps its pencil on the photo corner.
  const overlayEdit = !editing && (editable || canPublish);
  return (
    <View style={{ width: editing ? '100%' : size, gap: 6 }}>
      {preview.data ? (
        <Image
          source={{ uri: preview.data.url }}
          accessibilityLabel={image.altText}
          resizeMode="contain"
          style={{
            width: size,
            height: size,
            borderRadius: m.inputRadius,
            backgroundColor: c.inactive,
          }}
        />
      ) : (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: m.inputRadius,
            backgroundColor: c.inactive,
            justifyContent: 'center',
            padding: 8,
          }}
        >
          {preview.isPending && image.scanStatus === 'clean' ? (
            <Skeleton kind="inline" label="Loading photo" />
          ) : (
            <SetupText muted>
              {image.scanStatus !== 'clean' ? 'Scan: ' + image.scanStatus : 'Preview unavailable'}
            </SetupText>
          )}
        </View>
      )}
      {!image.roomId && image.sortOrder === 0 ? <StatusChip label="Cover" tone="success" /> : null}
      {/* Photos are live by default, so only an older private photo is tagged. */}
      {image.publishedAt ? null : <StatusChip label="Private" tone="neutral" />}
      {overlayEdit ? (
        <View style={{ position: 'absolute', top: 4, right: 4 }}>
          <IconChip
            Icon={Pencil}
            label="Edit photo"
            disabled={busy}
            onPress={() => setEditing(true)}
          />
        </View>
      ) : null}
      {(editable || canPublish) && editing ? (
        // PROP-001: one row of small actions instead of a stack of full-width buttons.
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {editing ? null : (
            <IconChip
              Icon={Pencil}
              text="Edit"
              label="Edit photo"
              disabled={busy}
              onPress={() => setEditing(true)}
            />
          )}
          {editable && editing ? (
            <>
              <PrivateFilePicker
                retainSelection={false}
                label="Replace photo"
                hideLabel
                hideHint
                purpose="listing_photo"
                actorId={actorId}
                Action={ReplaceAction}
                disabled={busy}
                onBusy={props.setUploading}
                onReady={(fileId) => {
                  if (fileId) run({ kind: 'replace', image, fileId });
                }}
              />
              <IconChip
                Icon={Trash2}
                text="Remove"
                label="Remove photo"
                disabled={busy}
                onPress={() => run({ kind: 'archive', image })}
              />
            </>
          ) : null}
          {canPublish && editing ? (
            <>
              {!image.roomId && image.sortOrder !== 0 ? (
                <IconChip
                  Icon={Star}
                  text="Cover"
                  label="Make cover"
                  disabled={busy || image.scanStatus !== 'clean'}
                  onPress={() => run({ kind: 'cover', image })}
                />
              ) : null}
              {/* New photos publish on add; only older private photos still need this. */}
              {image.publishedAt ? null : (
                <IconChip
                  Icon={Eye}
                  text="Publish"
                  label="Publish photo"
                  disabled={busy || image.scanStatus !== 'clean'}
                  onPress={() =>
                    run({
                      kind: 'edit',
                      image,
                      input: {
                        altText: image.altText,
                        sortOrder: image.sortOrder,
                        published: true,
                      },
                    })
                  }
                />
              )}
            </>
          ) : null}
          {editing ? (
            <IconChip
              Icon={X}
              label="Close photo controls"
              disabled={busy}
              onPress={() => setEditing(false)}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
