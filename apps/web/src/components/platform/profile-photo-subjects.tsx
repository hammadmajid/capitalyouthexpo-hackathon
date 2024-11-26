'use client';
import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { flagProfilePhoto, listProfilePhotoSubjects } from '@hsm/api-client';
import { Button } from '../ui/button';
import { useCommand } from '../services/use-command';
import { CommandRecovery } from '../services/command-recovery';
import { errorMessage } from '../../lib/messages';
import { OperationPages, OperationState, useOperationScope } from './admin-operations';
export function ProfilePhotoSubjects({ actorId }: { actorId: string }) {
  const scope = useOperationScope(actorId, 'profile-photo-subjects', 'content_moderator');
  const list = useInfiniteQuery({
    queryKey: scope.key,
    gcTime: 0,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      scope.read(
        (c) => listProfilePhotoSubjects(c, pageParam ? { cursor: pageParam } : {}),
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows =
    list.isError || (list.isFetching && !list.isFetchingNextPage)
      ? []
      : (list.data?.pages.flatMap((p) => p.data) ?? []);
  return (
    <section aria-label="Current profile photo moderation" className="space-y-3">
      <h4>Current profile photos</h4>
      <p>
        Open a reasoned case before viewing an existing photo. No historical approval is assumed.
      </p>
      <OperationState
        pending={list.isPending || list.isFetching}
        error={list.error}
        empty={!rows.length}
        retry={() => {
          void list.refetch();
        }}
      />
      {rows.map((row) => (
        <PhotoCase
          key={row.userId + row.fileId}
          actorId={actorId}
          userId={row.userId}
          fileId={row.fileId}
        />
      ))}
      <OperationPages
        hasMore={Boolean(list.hasNextPage)}
        fetching={list.isFetching}
        more={() => {
          void list.fetchNextPage();
        }}
        refresh={() => {
          void list.refetch();
        }}
      />
    </section>
  );
}
function PhotoCase({
  actorId,
  userId,
  fileId,
}: {
  actorId: string;
  userId: string;
  fileId: string;
}) {
  const scope = useOperationScope(actorId, 'profile-reviews-profile_photo', 'content_moderator');
  const [reason, setReason] = useState(''),
    [confirm, setConfirm] = useState(false);
  const command = useCommand(
    'flag-profile-photo:' + userId,
    (input: { fileId: string; reason: string }, key) =>
      scope.read((c) => flagProfilePhoto(c, userId, input, key)),
    [scope.key],
  );
  const locked = command.isPending || command.unresolved;
  return (
    <article className="space-y-2">
      <p>Subject {userId}</p>
      <CommandRecovery command={command} />
      {command.error ? <p role="alert">{errorMessage(command.error)}</p> : null}
      {command.isSuccess ? (
        <p role="status">Case created. Refresh the pending review queue.</p>
      ) : null}
      <label className="field-label">
        Moderation case reason
        <textarea
          className="field-input"
          maxLength={500}
          value={reason}
          disabled={locked || confirm}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {confirm ? (
        <>
          <p>Open a staff moderation case: {reason}</p>
          <Button
            disabled={locked}
            onClick={() =>
              command.mutate({ fileId, reason }, { onSuccess: () => setConfirm(false) })
            }
          >
            Confirm photo case
          </Button>
          <Button variant="secondary" disabled={locked} onClick={() => setConfirm(false)}>
            Cancel photo case
          </Button>
        </>
      ) : (
        <Button
          variant="secondary"
          disabled={locked || reason.trim().length < 8}
          onClick={() => setConfirm(true)}
        >
          Review photo case
        </Button>
      )}
    </article>
  );
}
