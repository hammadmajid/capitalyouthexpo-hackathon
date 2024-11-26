import { PropertyActionDialog, PropertyActionRow } from './property-action-dialog';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { Camera, UserRound, Pencil, ImageUp, Trash2 } from 'lucide-react-native';
import { randomUUID } from 'expo-crypto';
import {
  readOwnFileUrl,
  retainedCommand,
  submitProfileReview,
  waitForCleanFile,
  UploadFailure,
} from '@hsm/api-client';
import { mobileColors as c, mobileSurfaces, ownerMetrics as m } from '@hsm/ui';
import { client } from '../lib/runtime';
import { PendingDocumentUpload, uploadSelectedDocument } from '../lib/private-file';
import { safeMessage } from '../lib/messages';
import { SetupButton, SetupText } from './owner-wizard-ui';
import { useOwnerPhotoPreview } from './owner-photo-preview';
import { readOwnerPhotoState } from '../lib/owner-photo-state';
import {
  readOwnerPhotoDraft,
  keepOwnerPhotoDraft,
  clearOwnerPhotoDraft,
} from '../lib/owner-photo-draft';

export function OwnerProfilePhoto({
  userId,
  saved,
  value,
  onChange,
  onBusy,
  reviews,
  disabled,
  editable = true,
}: {
  userId: string;
  saved: string | null;
  value: string | null | undefined;
  onChange: (id: string | null | undefined) => void;
  onBusy: (value: boolean) => void;
  reviews: boolean;
  disabled: boolean;
  editable?: boolean;
}) {
  const [uri, setUri] = useState<string>(),
    [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(''),
    [failed, setFailed] = useState(false);
  const [pending, setPending] = useState<PendingDocumentUpload>();
  const [editingPhoto, setEditingPhoto] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const preview = useOwnerPhotoPreview();
  const [intent] = useState(() => retainedCommand('owner-photo:' + userId, randomUUID));
  const candidate = Boolean(value && value !== saved);
  useEffect(() => {
    let active = true;
    void readOwnerPhotoDraft(userId)
      .then((draft) => {
        if (!active || !draft) return;
        preview.restore(draft.previewUri);
        const upload = new PendingDocumentUpload(draft.fileId, draft.upload);
        setPending(upload);
        void choose(true, upload);
      })
      .catch(() => {
        if (active) {
          setFailed(true);
          setMessage('Photo recovery unavailable. Choose the photo again.');
        }
      });
    return () => {
      active = false;
    };
  }, [userId]);
  useEffect(() => {
    let active = true;
    const request =
      value && value !== saved
        ? readOwnFileUrl(client, value).then((image) => ({ uri: image.url, pending: false }))
        : readOwnerPhotoState(client, value === null ? null : saved, reviews);
    void request
      .then((result) => {
        if (active) {
          setUri(result.uri);
          if (result.pending) {
            setSubmitted(true);
            setMessage('In review');
          }
        }
      })
      .catch(() => {
        if (active) {
          setFailed(true);
          setMessage('Photo preview unavailable.');
        }
      });
    return () => {
      active = false;
    };
  }, [value, saved, reviews, userId]);
  function loading(value: boolean) {
    setBusy(value);
    onBusy(value);
  }
  async function choose(resume = false, restored?: PendingDocumentUpload) {
    setEditingPhoto(false);
    loading(true);
    setMessage('');
    setFailed(false);
    const scanning = restored ?? pending;
    try {
      const id =
        resume && scanning
          ? await waitForCleanFile(client, scanning.fileId, scanning.upload)
          : await uploadSelectedDocument(client, 'avatar', (source) => {
              preview.retain(source);
              setSubmitted(false);
            });
      if (id) {
        onChange(id);
        setPending(undefined);
        if (reviews) await requestReview(id);
      }
    } catch (error) {
      if (error instanceof PendingDocumentUpload) {
        setPending(error);
        const previewUri = preview.preserve();
        await keepOwnerPhotoDraft(userId, {
          fileId: error.fileId,
          upload: error.upload,
          ...(previewUri ? { previewUri } : {}),
          createdAt: Date.now(),
        });
        setMessage('Photo scan in progress.');
      } else if (error instanceof UploadFailure && error.code === 'PENDING' && scanning) {
        setPending(scanning);
        setMessage('Photo scan in progress.');
      } else {
        preview.clear();
        setFailed(true);
        setMessage(safeMessage(error));
      }
    } finally {
      loading(false);
    }
  }
  async function requestReview(id: string | undefined) {
    const body = intent.unresolved
      ? intent.original<{ fileId: string; reason: string }>()
      : { fileId: id, reason: 'Owner profile photo update' };
    await intent.submit(body, (input, key) =>
      submitProfileReview(client, 'profile_photo', input, key),
    );
    setSubmitted(true);
    await clearOwnerPhotoDraft(userId);
    setMessage('In review');
  }
  async function retryReview() {
    loading(true);
    setFailed(false);
    setMessage('');
    try {
      await requestReview(value ?? undefined);
    } catch (error) {
      setFailed(true);
      setMessage(safeMessage(error));
    } finally {
      loading(false);
    }
  }
  const locked = disabled || busy || !editable || intent.unresolved;
  return (
    <View style={s.section}>
      <View style={s.portrait}>
        <View style={s.avatar}>
          {preview.uri || uri ? (
            <Image
              accessibilityLabel="Owner profile photo"
              source={{ uri: preview.uri ?? uri }}
              style={s.image}
              onError={() => {
                preview.clear();
                setUri(undefined);
                setFailed(true);
                setMessage('Photo preview unavailable.');
              }}
            />
          ) : (
            <UserRound size={m.touch} color={c.primary} accessible={false} />
          )}
        </View>
        {editable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              value || preview.uri || (saved && value !== null)
                ? 'Change profile photo'
                : 'Add profile photo'
            }
            accessibilityState={{ disabled: locked, busy }}
            disabled={locked}
            onPress={() => {
              if (value || preview.uri || (saved && value !== null)) setEditingPhoto(true);
              else void choose();
            }}
            android_ripple={{ color: c.aqua }}
            style={[s.camera, locked && s.disabled]}
          >
            {busy ? (
              <ActivityIndicator color={c.surface} />
            ) : value || preview.uri || (saved && value !== null) ? (
              <Pencil size={m.stepIcon} color={c.surface} />
            ) : (
              <Camera size={m.stepIcon} color={c.surface} />
            )}
          </Pressable>
        ) : null}
      </View>
      <PropertyActionDialog
        visible={editable && editingPhoto}
        title="Profile photo"
        busy={locked}
        close={() => setEditingPhoto(false)}
      >
        <PropertyActionRow
          label="Replace profile photo"
          Icon={ImageUp}
          disabled={locked}
          onPress={() => void choose()}
        />
        {(!reviews || candidate || preview.uri) && !submitted ? (
          <PropertyActionRow
            label="Delete profile photo"
            Icon={Trash2}
            danger
            disabled={locked}
            onPress={() => {
              setEditingPhoto(false);
              preview.clear();
              setUri(undefined);
              void clearOwnerPhotoDraft(userId);
              onChange(reviews ? (saved ?? undefined) : null);
              setPending(undefined);
              setMessage('');
            }}
          />
        ) : null}
      </PropertyActionDialog>
      {pending ? (
        <SetupButton
          label="Check photo scan"
          secondary
          disabled={locked}
          onPress={() => void choose(true)}
        />
      ) : null}
      {reviews && intent.unresolved ? (
        <SetupButton
          label="Retry photo request"
          secondary
          disabled={disabled || busy}
          onPress={() => void retryReview()}
        />
      ) : null}
      {message ? (
        <SetupText alert={failed} muted={!failed}>
          {message}
        </SetupText>
      ) : null}
    </View>
  );
}
const s = StyleSheet.create({
  section: { alignItems: 'center', gap: m.smallGap },
  portrait: { width: m.touch * 2 + m.gap, height: m.touch * 2 + m.gap },
  avatar: {
    ...mobileSurfaces.icyCard,
    width: '100%',
    height: '100%',
    borderRadius: m.touch * 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%', borderRadius: m.touch * 2 },
  camera: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: m.touch,
    height: m.touch,
    borderRadius: m.touch,
    backgroundColor: c.primary,
    borderWidth: 3,
    borderColor: c.icy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.6 },
});
