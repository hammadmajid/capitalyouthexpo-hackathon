'use client';
import { useState } from 'react';
import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import {
  accessProfileReview,
  accessProfileReviewEvidence,
  ClientFailure,
  decideProfileReview,
  readProfileReviewHistory,
  type ProfileReviewKind,
} from '@hsm/api-client';
import { Button } from '../ui/button';
import { useCommand } from '../services/use-command';
import { CommandRecovery } from '../services/command-recovery';
import { errorMessage } from '../../lib/messages';
import {
  OperationConfirmation,
  OperationPages,
  OperationState,
  useOperationScope,
} from './admin-operations';
import { useProfileReviewPrivacy } from './profile-review-privacy';
export function ProfileReviewCase({
  actorId,
  kind,
  id,
  own = false,
  close,
}: {
  actorId: string;
  kind: ProfileReviewKind;
  id: string;
  own?: boolean;
  close: () => void;
}) {
  const scope = useOperationScope(
    actorId,
    'profile-reviews-' + (own ? 'own-' : '') + kind,
    own ? 'self' : kind === 'identity' ? 'root' : 'content_moderator',
  );
  const [purpose, setPurpose] = useState(''),
    [reason, setReason] = useState(''),
    [action, setAction] = useState<string>();
  const access = useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: async () => {
      const ticket = epoch.current,
        result = await scope.read((c) =>
          accessProfileReview(c, kind, id, { justification: purpose }, own),
        );
      if (ticket !== epoch.current) throw new ClientFailure('INVALID_RESPONSE');
      return result;
    },
  });
  const evidence = useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: async (fileId: string) => {
      const ticket = epoch.current,
        result = await scope.read((c) =>
          accessProfileReviewEvidence(c, kind, id, fileId, { justification: purpose }, own),
        );
      if (ticket !== epoch.current) throw new ClientFailure('INVALID_RESPONSE');
      return result;
    },
  });
  const epoch = useProfileReviewPrivacy(() => {
    access.reset();
    evidence.reset();
    setPurpose('');
    setReason('');
    setAction(undefined);
  });
  const history = useInfiniteQuery({
    queryKey: [...scope.key, 'history', id],
    initialPageParam: undefined as number | undefined,
    gcTime: 0,
    retry: false,
    queryFn: ({ pageParam, signal }) =>
      scope.read(
        (c) =>
          readProfileReviewHistory(
            c,
            kind,
            id,
            { ...(pageParam ? { cursor: pageParam } : {}) },
            own,
          ),
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const command = useCommand(
    'profile-review:' + kind + ':' + id + ':' + own,
    (input: unknown, key) => scope.read((c) => decideProfileReview(c, kind, id, input, key, own)),
    [scope.key],
  );
  const locked = command.isPending || command.unresolved;
  const detail = access.isError || access.isPending ? undefined : access.data;
  const actions = !detail
    ? []
    : own
      ? detail.review.status === 'pending' &&
        !(kind === 'profile_photo' && detail.previousPhotoFileId === detail.proposedPhotoFileId)
        ? ['cancel']
        : []
      : detail.review.status === 'pending'
        ? ['approve', 'reject']
        : kind === 'profile_photo' && detail.review.status === 'approved' && detail.currentPhoto
          ? ['withdraw']
          : [];
  return (
    <section
      aria-label="Profile review case"
      className="space-y-3 rounded-card border border-hsm-border p-4"
    >
      <CommandRecovery command={command} />
      {command.error ? <p role="alert">{errorMessage(command.error)}</p> : null}
      {command.isSuccess ? (
        <p role="status">Decision recorded. Refresh the queue for current status.</p>
      ) : null}
      <h4>{kind === 'identity' ? 'Identity correction' : 'Profile photo'} review</h4>
      <p>
        Private case {id}. Details and file access are audited. Reload current details after a
        conflict.
      </p>
      <label className="field-label">
        Access purpose
        <input
          aria-label="Profile review access purpose"
          className="field-input"
          maxLength={500}
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
        />
      </label>
      <Button
        disabled={access.isPending || purpose.trim().length < 8 || command.isPending}
        onClick={() => {
          evidence.reset();
          access.mutate();
        }}
      >
        Access private review details
      </Button>
      {access.isError ? <p role="alert">{errorMessage(access.error)}</p> : null}
      {detail ? (
        <>
          <p>
            {detail.review.status} · Revision {detail.review.version} · {detail.reason}
          </p>
          {kind === 'identity' ? (
            <dl>
              <dt>Previous name</dt>
              <dd>{detail.previousFullName ?? 'Unavailable'}</dd>
              <dt>Requested name</dt>
              <dd>{detail.proposedFullName ?? 'Unchanged'}</dd>
              <dt>Previous CNIC</dt>
              <dd>
                {detail.previousCnicLast4 ? 'Ending ' + detail.previousCnicLast4 : 'Unavailable'}
              </dd>
              <dt>Requested CNIC</dt>
              <dd>
                {detail.proposedCnic
                  ? own
                    ? 'Ending ' + detail.proposedCnic.slice(-4)
                    : detail.proposedCnic
                  : 'Unchanged'}
              </dd>
            </dl>
          ) : (
            <p>
              {detail.currentPhoto
                ? 'This is the current profile photo.'
                : 'This photo is not currently displayed.'}
            </p>
          )}
          {detail.evidenceFileIds.map((fileId, index) => (
            <Button
              key={fileId}
              variant="secondary"
              disabled={evidence.isPending || purpose.trim().length < 8}
              onClick={() => evidence.mutate(fileId)}
            >
              Access evidence {index + 1}
            </Button>
          ))}
          {evidence.error ? <p role="alert">{errorMessage(evidence.error)}</p> : null}
          {evidence.data && !evidence.isError && !evidence.isPending ? (
            <a href={evidence.data.url} target="_blank" rel="noreferrer">
              Open authorized evidence (expires shortly)
            </a>
          ) : null}
          {actions.length ? (
            <>
              <label className="field-label">
                Decision reason
                <textarea
                  aria-label="Profile review decision reason"
                  className="field-input"
                  maxLength={500}
                  disabled={locked || Boolean(action)}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              {action ? (
                <>
                  <p>
                    {action}: {reason}. Identity approval ends existing sessions and requires a
                    fresh login.
                  </p>
                  <OperationConfirmation
                    label="profile review decision"
                    pending={locked}
                    confirm={() =>
                      command.mutate(
                        {
                          ...(own ? {} : { action }),
                          expectedVersion: detail.review.version,
                          reason,
                        },
                        { onSuccess: close },
                      )
                    }
                    cancel={() => setAction(undefined)}
                  />
                </>
              ) : (
                actions.map((value) => (
                  <Button
                    key={value}
                    variant="secondary"
                    disabled={locked || reason.trim().length < 8}
                    onClick={() => setAction(value)}
                  >
                    {value} profile review
                  </Button>
                ))
              )}
            </>
          ) : null}
        </>
      ) : null}
      <h5>Decision history</h5>
      <OperationState
        pending={history.isPending || history.isFetching}
        error={history.error}
        retry={() => {
          void history.refetch();
        }}
        empty={!history.data?.pages.some((p) => p.data.length)}
      />
      {!history.isError && !history.isFetching
        ? history.data?.pages
            .flatMap((p) => p.data)
            .map((row) => (
              <p key={row.version}>
                Revision {row.version} · {row.action} · {row.actorId} · {row.createdAt} ·{' '}
                {row.reason}
              </p>
            ))
        : null}
      <OperationPages
        hasMore={Boolean(history.hasNextPage)}
        fetching={history.isFetching}
        more={() => {
          void history.fetchNextPage();
        }}
        refresh={() => {
          access.reset();
          evidence.reset();
          void history.refetch();
        }}
      />
      <Button variant="secondary" disabled={command.isPending} onClick={close}>
        Close private review
      </Button>
    </section>
  );
}
