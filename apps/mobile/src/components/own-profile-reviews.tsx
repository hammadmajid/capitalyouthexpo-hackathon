import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RetainedCommand, submitProfileReview, type ProfileReviewKind } from '@hsm/api-client';
import { identityCorrectionInputSchema, profilePhotoSubmissionSchema } from '@hsm/contracts';
import { PrivateFilePicker } from './private-file-picker';
import { NativeProfileReviewBoard } from './admin/profile-reviews';
import { useAdminData } from './admin/data';
import { Choices } from './admin/staff-ui';
import { AdminCard, AdminField, AdminHeading } from './admin/ui';
import { Button, Copy } from './ui';
import { safeMessage } from '../lib/messages';
export function NativeOwnProfileReviews({ standalone = false }: { standalone?: boolean } = {}) {
  const [open, setOpen] = useState(standalone),
    [kind, setKind] = useState<ProfileReviewKind>('identity');
  return (
    <AdminCard>
      {!standalone ? (
        <Button
          secondary
          label={open ? 'Close profile reviews' : 'Profile correction and photo reviews'}
          onPress={() => setOpen(!open)}
        />
      ) : null}
      {open ? (
        <>
          <Choices
            label="Review type"
            values={['identity', 'profile_photo']}
            value={kind}
            onChange={(value) => setKind(value === 'identity' ? 'identity' : 'profile_photo')}
          />
          <Submission key={kind} kind={kind} />
          <NativeProfileReviewBoard key={'board-' + kind} kind={kind} own />
        </>
      ) : null}
    </AdminCard>
  );
}
function Submission({ kind }: { kind: ProfileReviewKind }) {
  const data = useAdminData(),
    cache = useQueryClient();
  const [resetSeed, setResetSeed] = useState(0);
  const [fullName, setName] = useState(''),
    [cnic, setCnic] = useState(''),
    [reason, setReason] = useState('');
  const [front, setFront] = useState<string>(),
    [back, setBack] = useState<string>(),
    [photo, setPhoto] = useState<string>();
  const [busy, setBusy] = useState<Record<string, boolean>>({}),
    [preview, setPreview] = useState(false),
    [invalid, setInvalid] = useState(false);
  // No global retention of a private CNIC request body.
  const [intent] = useState(() => new RetainedCommand(randomUUID));
  const command = useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: (input: unknown) =>
      intent.submit(input, (body, key) =>
        data.read((c) => submitProfileReview(c, kind, body, key), undefined, false),
      ),
    onSuccess: async () => {
      clear();
      await cache.invalidateQueries({ queryKey: data.key });
    },
  });
  function clear() {
    setResetSeed((value) => value + 1);
    setName('');
    setCnic('');
    setReason('');
    setFront(undefined);
    setBack(undefined);
    setPhoto(undefined);
    setPreview(false);
  }
  useFocusEffect(
    useCallback(
      () => () => {
        setName('');
        setCnic('');
        setReason('');
        setPreview(false);
      },
      [],
    ),
  );
  const locked = command.isPending || intent.unresolved || Object.values(busy).some(Boolean);
  function input() {
    return kind === 'identity'
      ? identityCorrectionInputSchema.safeParse({
          ...(fullName.trim() ? { fullName } : {}),
          ...(cnic.trim() ? { cnic } : {}),
          reason,
          evidenceFileIds: [front, back].filter((value): value is string => Boolean(value)),
        })
      : profilePhotoSubmissionSchema.safeParse({ fileId: photo, reason });
  }
  return (
    <AdminCard>
      <AdminHeading>Request a controlled review</AdminHeading>
      <Copy>
        Your current profile remains until approval. Approved identity changes require a fresh
        login. Contact details are not changed here.
      </Copy>
      {command.error ? (
        <Copy alert>
          {safeMessage(command.error)} Pull down to check review history if a response was lost.
        </Copy>
      ) : null}
      {command.isSuccess ? <Copy>Request submitted for review.</Copy> : null}
      {intent.unresolved ? (
        <Button
          secondary
          label="Retry original profile request"
          disabled={command.isPending}
          onPress={() => command.mutate(intent.original())}
        />
      ) : null}
      {kind === 'identity' ? (
        <>
          <AdminField
            label="Requested legal name"
            value={fullName}
            onChange={setName}
            disabled={locked || preview}
            maxLength={150}
          />
          <AdminField
            label="Requested CNIC"
            value={cnic}
            onChange={setCnic}
            disabled={locked || preview}
            maxLength={15}
          />
          <PrivateFilePicker
            key={resetSeed}
            label="Identity proof / CNIC front"
            actorId={data.actorId}
            purpose="verification_document"
            onReady={setFront}
            onBusy={(value) => setBusy((b) => ({ ...b, front: value }))}
            disabled={locked || preview}
          />
          <PrivateFilePicker
            key={resetSeed}
            label="CNIC back (required for CNIC changes)"
            actorId={data.actorId}
            purpose="verification_document"
            onReady={setBack}
            onBusy={(value) => setBusy((b) => ({ ...b, back: value }))}
            disabled={locked || preview}
          />
        </>
      ) : (
        <PrivateFilePicker
          key={resetSeed}
          label="Profile photo for review"
          actorId={data.actorId}
          purpose="avatar"
          onReady={setPhoto}
          onBusy={(value) => setBusy({ photo: value })}
          disabled={locked || preview}
        />
      )}
      <AdminField
        label="Profile request reason"
        value={reason}
        onChange={setReason}
        disabled={locked || preview}
        maxLength={500}
        multiline
      />
      {invalid ? (
        <Copy alert>
          Provide a requested change, meaningful reason and clean proof. CNIC changes need front and
          back documents.
        </Copy>
      ) : null}
      {preview ? (
        <>
          <Copy>Confirm submitting this private request for review?</Copy>
          <Button
            label="Confirm profile request"
            disabled={locked}
            onPress={() => {
              const value = input();
              if (value.success) command.mutate(value.data);
              else {
                setInvalid(true);
                setPreview(false);
              }
            }}
          />
          <Button
            secondary
            label="Revise profile request"
            disabled={locked}
            onPress={() => setPreview(false)}
          />
        </>
      ) : (
        <Button
          label="Review profile request"
          disabled={locked}
          onPress={() => {
            const value = input();
            setInvalid(!value.success);
            if (value.success) setPreview(true);
          }}
        />
      )}
    </AdminCard>
  );
}
