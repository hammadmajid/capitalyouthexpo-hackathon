'use client';
import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  dismissReviewReport,
  listModeratedReviews,
  listModerationReports,
  moderateReview,
  readModerationHistory,
  readModerationReview,
} from '@hsm/api-client';
import type { ModerationReview } from '@hsm/contracts';
import { errorMessage } from '../../lib/messages';
import { Button } from '../ui/button';
import { useCommand } from '../services/use-command';
import { CommandRecovery } from '../services/command-recovery';
import {
  OperationConfirmation,
  OperationPages,
  OperationSection,
  OperationState,
  useOperationScope,
} from './admin-operations';
type Scope = ReturnType<typeof useOperationScope>;
type Selected = { reviewId: string; reportId?: string };
export function ModerationOperations({ actorId }: { actorId: string }) {
  const scope = useOperationScope(actorId, 'moderation', 'content_moderator');
  const [mode, setMode] = useState('reported'),
    [reportStatus, setReportStatus] = useState('open'),
    [selected, setSelected] = useState<Selected>();
  const reports = useInfiniteQuery({
    queryKey: [...scope.key, 'reports', reportStatus],
    enabled: mode === 'reported',
    gcTime: 0,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      scope.read(
        (c) =>
          listModerationReports(c, {
            reportStatus,
            limit: 20,
            ...(pageParam ? { cursor: pageParam } : {}),
          }),
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const reviews = useInfiniteQuery({
    queryKey: [...scope.key, 'reviews', mode],
    enabled: mode !== 'reported',
    gcTime: 0,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      scope.read(
        (c) =>
          listModeratedReviews(c, {
            status: mode,
            limit: 20,
            ...(pageParam ? { cursor: pageParam } : {}),
          }),
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const queue = mode === 'reported' ? reports : reviews;
  return (
    <OperationSection title="Review moderation">
      <p>Policy violations only. Never moderate a review simply because it is negative.</p>
      <label>
        Moderation queue
        <select
          aria-label="Moderation queue"
          className="field-input"
          value={mode}
          onChange={(e) => {
            setMode(e.target.value);
            setSelected(undefined);
          }}
        >
          <option value="reported">Reported reviews</option>
          <option value="hidden">Hidden reviews</option>
          <option value="removed">Removed reviews</option>
        </select>
      </label>
      {mode === 'reported' ? (
        <label>
          Report status
          <select
            aria-label="Review report status"
            className="field-input"
            value={reportStatus}
            onChange={(e) => {
              setReportStatus(e.target.value);
              setSelected(undefined);
            }}
          >
            {['open', 'investigating', 'actioned', 'dismissed'].map((value) => (
              <option value={value} key={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <OperationState
        pending={queue.isPending}
        error={queue.error}
        retry={() => void queue.refetch()}
        empty={!queue.data?.pages.some((page) => page.data.length)}
      />
      {!queue.isError && mode === 'reported'
        ? reports.data?.pages
            .flatMap((page) => page.data)
            .map((row) => (
              <div key={row.reportId}>
                <p>
                  Reported for {row.reason}: {row.reviewBody ?? 'Ratings only'} ({row.reviewStatus})
                </p>
                <p>{row.details}</p>
                <Button
                  variant="secondary"
                  onClick={() =>
                    setSelected({
                      reviewId: row.reviewId,
                      ...(row.status === 'open' ? { reportId: row.reportId } : {}),
                    })
                  }
                >
                  Review reported content
                </Button>
              </div>
            ))
        : null}
      {!queue.isError && mode !== 'reported'
        ? reviews.data?.pages
            .flatMap((page) => page.data)
            .map((row) => (
              <div key={row.reviewId}>
                <p>
                  {row.body ?? 'Ratings only'} · {row.status}
                </p>
                <Button variant="secondary" onClick={() => setSelected({ reviewId: row.reviewId })}>
                  Review moderated content
                </Button>
              </div>
            ))
        : null}
      {!queue.isPending && !queue.isError ? (
        <OperationPages
          hasMore={Boolean(queue.hasNextPage)}
          fetching={queue.isFetching}
          more={() => void queue.fetchNextPage()}
          refresh={() => void queue.refetch()}
        />
      ) : null}
      {selected ? (
        <ModerationDetail
          key={selected.reviewId + (selected.reportId ?? '')}
          selected={selected}
          scope={scope}
          close={() => setSelected(undefined)}
        />
      ) : null}
    </OperationSection>
  );
}
function ModerationDetail({
  selected,
  scope,
  close,
}: {
  selected: Selected;
  scope: Scope;
  close: () => void;
}) {
  const detail = useQuery({
    queryKey: [...scope.key, 'detail', selected.reviewId],
    gcTime: 0,
    retry: false,
    queryFn: ({ signal }) => scope.read((c) => readModerationReview(c, selected.reviewId), signal),
  });
  const history = useInfiniteQuery({
    queryKey: [...scope.key, 'history', selected.reviewId],
    gcTime: 0,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      scope.read(
        (c) =>
          readModerationHistory(c, selected.reviewId, {
            limit: 20,
            ...(pageParam ? { cursor: pageParam } : {}),
          }),
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const current = !detail.isError && !detail.isFetching ? detail.data : undefined;
  return (
    <div className="space-y-4 border-t border-hsm-border pt-4">
      <Button variant="secondary" onClick={close}>
        Close review detail
      </Button>
      <OperationState
        pending={detail.isPending || detail.isFetching}
        error={detail.error}
        retry={() => void detail.refetch()}
      />
      {current ? (
        <>
          <h4 className="font-semibold">Current review · {current.status}</h4>
          <p>{current.body ?? 'Ratings only'}</p>
          <p>{current.moderationReason}</p>
          <ModerationDecision
            key={current.version}
            review={current}
            {...(selected.reportId ? { reportId: selected.reportId } : {})}
            scope={scope}
          />
        </>
      ) : null}
      <h4 className="font-semibold">Moderation history</h4>
      <OperationState
        pending={history.isPending}
        error={history.error}
        retry={() => void history.refetch()}
        empty={!history.data?.pages.some((page) => page.data.length)}
      />
      {!history.isError ? (
        <ol>
          {history.data?.pages
            .flatMap((page) => page.data)
            .map((event) => (
              <li key={event.id}>
                {event.action} · {event.reviewerName} · {event.createdAt}
                <p>{event.reason}</p>
              </li>
            ))}
        </ol>
      ) : null}
      {!history.isError && history.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={history.isFetching}
          onClick={() => void history.fetchNextPage()}
        >
          Load more moderation history
        </Button>
      ) : null}
    </div>
  );
}
function ModerationDecision({
  review,
  reportId,
  scope,
}: {
  review: ModerationReview;
  reportId?: string;
  scope: Scope;
}) {
  const [action, setAction] = useState(''),
    [reason, setReason] = useState(''),
    [reviewing, setReviewing] = useState(false);
  const command = useCommand(
    'AdminModeration:decision',
    (input: { action: string; reason: string }, key) =>
      scope.read<unknown>((client) =>
        input.action === 'dismiss'
          ? dismissReviewReport(client, reportId, { reason: input.reason }, key)
          : moderateReview(
              client,
              review.reviewId,
              {
                action: input.action,
                reason: input.reason,
                expectedVersion: review.version,
                ...(reportId ? { reportId } : {}),
              },
              key,
            ),
      ),
    [scope.key],
  );
  const locked = command.isPending || command.unresolved;
  return (
    <div className="space-y-3">
      <CommandRecovery command={command} />
      <label>
        Policy action
        <select
          aria-label="Review moderation action"
          className="field-input"
          value={action}
          disabled={locked || reviewing}
          onChange={(e) => setAction(e.target.value)}
        >
          <option value="">Choose a policy action</option>
          {review.status === 'published' ? (
            <option value="hide">Hide</option>
          ) : (
            <option value="restore">Restore</option>
          )}
          {review.status !== 'removed' ? <option value="remove">Remove</option> : null}
          {reportId ? <option value="dismiss">Dismiss report</option> : null}
        </select>
      </label>
      <label>
        Policy reason
        <textarea
          aria-label="Policy reason"
          className="field-input"
          value={reason}
          maxLength={500}
          disabled={locked || reviewing}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {reviewing ? (
        <OperationConfirmation
          label="moderation decision"
          pending={command.isPending}
          disabled={command.unresolved}
          cancel={() => setReviewing(false)}
          confirm={() =>
            command.mutate(
              { action, reason: reason.trim() },
              { onSuccess: () => setReviewing(false) },
            )
          }
        />
      ) : (
        <Button disabled={!action || !reason.trim() || locked} onClick={() => setReviewing(true)}>
          Review moderation decision
        </Button>
      )}
      {command.isError ? (
        <p role="alert">
          {errorMessage(command.error)} Refresh the current review before changing a stale version.
        </p>
      ) : null}
      {command.isSuccess ? <p role="status">Moderation decision recorded by server.</p> : null}
    </div>
  );
}
