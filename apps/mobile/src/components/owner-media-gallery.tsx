import type { ComponentProps, ReactNode } from 'react';
import { Camera, Images, type LucideIcon } from 'lucide-react-native';
import { mobileColors as colors } from '@hsm/ui';
import { IconChip } from './inventory-tools';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { listListingGallery } from '@hsm/api-client';
import type { GalleryTarget } from '@hsm/contracts';
import { actorClient } from '../lib/runtime';
import { withFreshSession } from '../lib/fresh-session';
import { safeMessage } from '../lib/messages';
import { PrivateFilePicker } from './private-file-picker';
import { useNativeCommand } from './services/use-command';
import { SetupButton, SetupCard, SetupHeading, SetupText } from './owner-wizard-ui';
import { Skeleton } from './loading/skeleton';
import { OwnerMediaPhoto } from './owner-media-photo';
import { runMediaCommand, type MediaCommand } from './owner-media-command';
// "Choose photo" with a camera icon; the 5 MB rule is enforced by the picker itself.
function PhotoAction(props: ComponentProps<typeof SetupButton>) {
  return <SetupButton {...props} Icon={Camera} />;
}
// Compact galleries sit inside another card, so they skip the extra card frame.
function Frame({ compact, children }: { compact: boolean; children: ReactNode }) {
  return compact ? <View style={{ gap: 8 }}>{children}</View> : <SetupCard>{children}</SetupCard>;
}
function CompactPhotoAction(props: ComponentProps<typeof SetupButton>) {
  return (
    <IconChip
      Icon={Camera}
      text="Add"
      label={props.label}
      disabled={props.disabled ?? false}
      onPress={props.onPress}
    />
  );
}
export function OwnerMediaGallery(props: {
  actorId: string;
  branchId: string;
  roomId?: string | undefined;
  bedId?: string | undefined;
  title: string;
  Icon?: LucideIcon | undefined;
  note?: string | undefined;
  section?: 'cover' | 'kitchen' | 'dining' | 'general';
  compact?: boolean;
}) {
  const { actorId, branchId, roomId, bedId, section } = props;
  const [uploading, setUploading] = useState(false);
  const target: GalleryTarget | undefined = roomId
    ? bedId
      ? { kind: 'bed', roomId, bedId }
      : { kind: 'room', roomId }
    : undefined;
  const queryKey = ['owner-gallery', actorId, branchId, roomId ?? 'hostel', bedId ?? 'room'];
  const gallery = useInfiniteQuery({
    queryKey,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      withFreshSession(async () =>
        listListingGallery(await actorClient(actorId), branchId, {
          limit: 30,
          ...(roomId ? { roomId } : {}),
          ...(bedId ? { bedId } : {}),
          ...(pageParam ? { cursor: pageParam } : {}),
        }),
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const command = useNativeCommand<MediaCommand>(
    'owner-gallery:' + branchId + ':' + (bedId ?? roomId ?? 'hostel'),
    actorId,
    (client, body, key) => runMediaCommand(client, branchId, body, key),
    [
      ['owner-gallery', actorId, branchId],
      ['public-gallery', branchId],
      ['floor-rooms', actorId, branchId],
    ],
  );
  const all = gallery.data?.pages.flatMap((page) => page.data) ?? [];
  const images = all
    .filter((image) =>
      section === 'cover'
        ? image.sortOrder === 0
        : section === 'kitchen'
          ? /^kitchen\b/i.test(image.altText)
          : section === 'dining'
            ? /^dining\b/i.test(image.altText)
            : section === 'general'
              ? !/^(kitchen|dining)\b/i.test(image.altText) && image.sortOrder !== 0
              : true,
    )
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const canEdit = gallery.data?.pages[0]?.canEdit ?? false;
  const canPublish = gallery.data?.pages[0]?.canPublish ?? false;
  const busy = command.isPending || command.unresolved || uploading;
  const canAdd = canEdit && (section !== 'cover' || canPublish);
  // A picked photo is saved at once. Owners don't name photos; the API's required alt text
  // comes from the gallery title; kitchen and dining photos keep their prefix for filtering.
  const prefix = section === 'kitchen' ? 'Kitchen' : section === 'dining' ? 'Dining' : undefined;
  const altText = (
    prefix && !props.title.toLowerCase().startsWith(prefix.toLowerCase())
      ? prefix + ': ' + props.title
      : props.title
  ).slice(0, 240);
  const attach = (fileId: string | undefined) => {
    if (!fileId) return;
    command.mutate({
      kind: 'attach',
      fileId,
      altText,
      sortOrder:
        section === 'cover' && !all.some((image) => image.sortOrder === 0)
          ? 0
          : Math.max(0, ...all.map((image) => image.sortOrder)) + 1,
      ...(target ? { target } : {}),
      ...(section === 'cover' ? { cover: true } : {}),
      ...(canPublish ? { publish: true } : {}),
    });
  };
  const picker = (
    <PrivateFilePicker
      retainSelection={false}
      // The button already says what to do: "Choose photo" / "Choose cover photo".
      label={section === 'cover' ? 'cover photo' : 'photo'}
      hideLabel
      hideHint
      purpose="listing_photo"
      actorId={actorId}
      Action={props.compact ? CompactPhotoAction : PhotoAction}
      disabled={busy}
      onBusy={setUploading}
      onReady={attach}
    />
  );
  return (
    <Frame compact={props.compact ?? false}>
      {props.compact ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View className="h-11 w-11 items-center justify-center rounded-pill bg-aqua">
            {props.Icon ? (
              <props.Icon size={22} color={colors.primary} />
            ) : (
              <Images size={22} color={colors.primary} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" className="font-heading text-body text-heading">
              {props.title}
            </Text>
            {props.note ? (
              <Text className="font-body text-xs text-secondary">{props.note}</Text>
            ) : null}
          </View>
          {canAdd ? picker : null}
        </View>
      ) : (
        <SetupHeading>{props.title}</SetupHeading>
      )}
      {gallery.isPending ? (
        <Skeleton kind={props.compact ? 'inline' : 'list'} label="Loading photos" />
      ) : null}
      {gallery.data && !images.length ? <SetupText muted>No photos</SetupText> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {images.map((image) => (
          <OwnerMediaPhoto
            key={image.id}
            actorId={actorId}
            image={image}
            canEdit={canEdit}
            canPublish={canPublish}
            busy={busy}
            setUploading={setUploading}
            compact={props.compact ?? false}
            run={(body) =>
              command.mutate({
                ...body,
                ...(body.kind === 'replace' && target ? { target } : {}),
                ...(body.kind === 'replace' && canPublish ? { publish: true } : {}),
              })
            }
          />
        ))}
      </View>
      {gallery.hasNextPage ? (
        <SetupButton
          secondary
          label={gallery.isFetchingNextPage ? 'Loading photos' : 'More photos'}
          disabled={gallery.isFetchingNextPage}
          onPress={() => void gallery.fetchNextPage()}
        />
      ) : null}
      {canAdd && !props.compact ? picker : null}
      {command.unresolved && !command.isPending ? (
        <SetupButton label="Retry previous photo change" onPress={() => command.retryOriginal()} />
      ) : null}
      {(gallery.error ?? command.error) ? (
        <SetupText alert>{safeMessage(gallery.error ?? command.error)}</SetupText>
      ) : null}
    </Frame>
  );
}
