import { useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { FileImage, Pencil } from 'lucide-react-native';
import { readOwnFileUrl } from '@hsm/api-client';
import { mobileColors as c, mobileSurfaces, ownerMetrics as m } from '@hsm/ui';
import { actorClient, client } from '../lib/runtime';
import { withFreshSession } from '../lib/fresh-session';

export function PhotoPickerPreview(props: {
  fileId: string;
  actorId?: string | undefined;
  label: string;
  disabled: boolean;
  image: boolean;
  edit: () => void;
}) {
  const [preview, setPreview] = useState<{ key: string; url: string }>();
  const key = (props.actorId ?? '') + ':' + props.fileId;
  useEffect(() => {
    let active = true;
    void withFreshSession(async () =>
      readOwnFileUrl(props.actorId ? await actorClient(props.actorId) : client, props.fileId),
    )
      .then(({ url }) => {
        if (active) setPreview({ key, url });
      })
      .catch(() => {
        if (active) setPreview(undefined);
      });
    return () => {
      active = false;
    };
  }, [key, props.fileId, props.actorId]);
  return (
    <View
      style={{
        width: m.touch * 3,
        height: m.touch * 3,
        ...mobileSurfaces.icyCard,
        borderRadius: m.inputRadius,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {props.image && preview?.key === key ? (
        <Image
          source={{ uri: preview.url }}
          accessibilityLabel={props.label + ' preview'}
          style={{ width: '100%', height: '100%', borderRadius: m.inputRadius }}
          resizeMode="cover"
          onError={() => setPreview(undefined)}
        />
      ) : (
        <FileImage color={c.primary} size={m.touch} />
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={'Edit ' + props.label}
        accessibilityState={{ disabled: props.disabled }}
        disabled={props.disabled}
        onPress={props.edit}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          minWidth: m.touch,
          minHeight: m.touch,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            ...mobileSurfaces.icyCard,
            padding: m.smallGap,
            borderRadius: m.touch,
            borderWidth: 1,
          }}
        >
          <Pencil size={m.stepIcon} color={c.primary} />
        </View>
      </Pressable>
    </View>
  );
}
