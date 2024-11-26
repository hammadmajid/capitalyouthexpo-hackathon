'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { identityCorrectionInputSchema, profilePhotoSubmissionSchema } from '@hsm/contracts';
import { RetainedCommand, submitProfileReview, type ProfileReviewKind } from '@hsm/api-client';
import { PrivateFileInput } from '../private-file-input';
import { Button } from '../ui/button';
import { errorMessage } from '../../lib/messages';
import { ProfileReviewBoard } from './profile-review-board';
import { useOperationScope } from './admin-operations';
import { useProfileReviewPrivacy } from './profile-review-privacy';
export function OwnProfileReviews({ actorId }: { actorId: string }) {
  const [open, setOpen] = useState(false),
    [kind, setKind] = useState<ProfileReviewKind>('identity');
  return (
    <section aria-label="My profile reviews" className="space-y-4">
      <Button variant="secondary" onClick={() => setOpen(!open)}>
        {open ? 'Close profile reviews' : 'Profile correction and photo reviews'}
      </Button>
      {open ? (
        <>
          <label className="field-label">
            Review type
            <select
              className="field-input"
              value={kind}
              onChange={(e) =>
                setKind(e.target.value === 'identity' ? 'identity' : 'profile_photo')
              }
            >
              <option value="identity">Legal name / CNIC correction</option>
              <option value="profile_photo">Profile photo</option>
            </select>
          </label>
          <ProfileReviewSubmission key={actorId + kind} actorId={actorId} kind={kind} />
          <ProfileReviewBoard key={kind} actorId={actorId} kind={kind} own />
        </>
      ) : null}
    </section>
  );
}
function ProfileReviewSubmission({ actorId, kind }: { actorId: string; kind: ProfileReviewKind }) {
  const scope = useOperationScope(actorId, 'profile-reviews-own-' + kind, 'self'),
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
  // Sensitive submission bodies are local to this form, never the global retained-command registry.
  const [intent] = useState(() => new RetainedCommand(() => crypto.randomUUID()));
  const command = useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: (input: unknown) =>
      intent.submit(input, (body, key) =>
        scope.read((c) => submitProfileReview(c, kind, body, key)),
      ),
    onSuccess: async () => {
      clear();
      await cache.invalidateQueries({ queryKey: scope.key });
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
  useProfileReviewPrivacy(clear, false);
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
  function review() {
    const value = input();
    setInvalid(!value.success);
    if (value.success) setPreview(true);
  }
  return (
    <section
      aria-label="Submit profile review"
      className="space-y-3 rounded-card border border-hsm-border p-4"
    >
      <h4>Request a controlled review</h4>
      <p>
        Original history is preserved. Name/CNIC changes require documentary review and a fresh
        login after approval. Contact details are not changed here.
      </p>
      {command.error ? (
        <p role="alert">
          {errorMessage(command.error)} Refresh your review history if a response was lost.
        </p>
      ) : null}
      {command.isSuccess ? <p role="status">Request submitted for review.</p> : null}
      {intent.unresolved ? (
        <Button
          disabled={command.isPending}
          variant="secondary"
          onClick={() => command.mutate(intent.original())}
        >
          Retry original profile request
        </Button>
      ) : null}
      <fieldset disabled={locked || preview} className="space-y-3">
        {kind === 'identity' ? (
          <>
            <label className="field-label">
              Requested legal name (optional)
              <input
                aria-label="Requested legal name"
                className="field-input"
                maxLength={150}
                value={fullName}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="field-label">
              Requested CNIC (optional)
              <input
                aria-label="Requested CNIC"
                className="field-input"
                autoComplete="off"
                maxLength={15}
                value={cnic}
                onChange={(e) => setCnic(e.target.value)}
              />
            </label>
            <PrivateFileInput
              key={'front-' + resetSeed}
              id="review-proof-front"
              label="Identity proof / CNIC front"
              purpose="verification_document"
              onReady={setFront}
              onBusy={(value) => setBusy((b) => ({ ...b, front: value }))}
            />
            <PrivateFileInput
              key={'back-' + resetSeed}
              id="review-proof-back"
              label="CNIC back (required for CNIC changes)"
              purpose="verification_document"
              onReady={setBack}
              onBusy={(value) => setBusy((b) => ({ ...b, back: value }))}
            />
          </>
        ) : (
          <PrivateFileInput
            key={resetSeed}
            id="review-avatar"
            label="Profile photo for review"
            purpose="avatar"
            onReady={setPhoto}
            onBusy={(value) => setBusy({ photo: value })}
          />
        )}
        <label className="field-label">
          Request reason
          <textarea
            aria-label="Profile request reason"
            className="field-input"
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <Button onClick={review}>Review profile request</Button>
      </fieldset>
      {invalid ? (
        <p role="alert">
          Provide the requested change, a meaningful reason and clean evidence. CNIC changes need
          front and back documents.
        </p>
      ) : null}
      {preview ? (
        <>
          <p>
            Submit this {kind === 'identity' ? 'identity correction' : 'profile photo'} for review?
            Your current profile remains until an approved decision.
          </p>
          <Button
            disabled={locked}
            onClick={() => {
              const value = input();
              if (value.success) command.mutate(value.data);
              else {
                setInvalid(true);
                setPreview(false);
              }
            }}
          >
            Confirm profile request
          </Button>
          <Button variant="secondary" disabled={locked} onClick={() => setPreview(false)}>
            Revise profile request
          </Button>
        </>
      ) : null}
    </section>
  );
}
