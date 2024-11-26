'use client';
import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { listProfileReviews, type ProfileReviewKind } from '@hsm/api-client';
import { Button } from '../ui/button';
import {
  OperationPages,
  OperationSection,
  OperationState,
  useOperationScope,
} from './admin-operations';
import { ProfileReviewCase } from './profile-review-case';
import { ProfilePhotoSubjects } from './profile-photo-subjects';
export function ProfileReviewBoard({
  actorId,
  kind,
  own = false,
}: {
  actorId: string;
  kind: ProfileReviewKind;
  own?: boolean;
}) {
  const scope = useOperationScope(
    actorId,
    'profile-reviews-' + (own ? 'own-' : '') + kind,
    own ? 'self' : kind === 'identity' ? 'root' : 'content_moderator',
  );
  const [status, setStatus] = useState('pending'),
    [selected, setSelected] = useState<string>();
  const list = useInfiniteQuery({
    queryKey: [...scope.key, status],
    initialPageParam: undefined as string | undefined,
    gcTime: 0,
    retry: false,
    queryFn: ({ pageParam, signal }) =>
      scope.read(
        (c) =>
          listProfileReviews(c, kind, { status, ...(pageParam ? { cursor: pageParam } : {}) }, own),
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows =
    list.isError || (list.isFetching && !list.isFetchingNextPage)
      ? []
      : (list.data?.pages.flatMap((p) => p.data) ?? []);
  return (
    <OperationSection
      title={
        (own ? 'My ' : '') +
        (kind === 'identity' ? 'identity correction reviews' : 'profile photo reviews')
      }
    >
      <label className="field-label">
        Review status
        <select
          className="field-input"
          aria-label={kind + ' review status'}
          value={status}
          onChange={(e) => {
            setSelected(undefined);
            setStatus(e.target.value);
          }}
        >
          {[
            'pending',
            'approved',
            'rejected',
            'cancelled',
            ...(kind === 'profile_photo' ? ['withdrawn'] : []),
          ].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <OperationState
        pending={list.isPending || list.isFetching}
        error={list.error}
        empty={!rows.length}
        retry={() => {
          void list.refetch();
        }}
      />
      {rows.map((row) => (
        <article key={row.id} className="space-y-2 border-b border-hsm-border py-3">
          <p>
            {row.status} · Revision {row.version} · {row.submittedAt}
          </p>
          {!own ? <p>Subject {row.userId}</p> : null}
          <Button variant="secondary" onClick={() => setSelected(row.id)}>
            Review case {row.id}
          </Button>
        </article>
      ))}
      <OperationPages
        hasMore={Boolean(list.hasNextPage)}
        fetching={list.isFetching}
        more={() => {
          void list.fetchNextPage();
        }}
        refresh={() => {
          setSelected(undefined);
          void list.refetch();
        }}
      />
      {selected ? (
        <ProfileReviewCase
          key={actorId + ':' + selected}
          actorId={actorId}
          kind={kind}
          id={selected}
          own={own}
          close={() => setSelected(undefined)}
        />
      ) : null}
      {!own && kind === 'profile_photo' ? <ProfilePhotoSubjects actorId={actorId} /> : null}
    </OperationSection>
  );
}
