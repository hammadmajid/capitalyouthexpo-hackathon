'use client';
import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  decideHostelRevision,
  listHostelRevisions,
  readHostelRevisionReview,
} from '@hsm/api-client';
import { formatDate, type HostelRevisionReview } from '@hsm/contracts';
import { errorMessage } from '../../lib/messages';
import { revisionRows, revisionValue } from '../hostel-revision/revision-fields';
import { CommandRecovery } from '../services/command-recovery';
import { useCommand } from '../services/use-command';
import { Button } from '../ui/button';
import {
  OperationConfirmation,
  OperationPages,
  OperationSection,
  OperationState,
  useOperationScope,
} from './admin-operations';
type Scope = ReturnType<typeof useOperationScope>;
// CHG-041 / ADM-007: changes to approved hostels wait here; the live listing stays unchanged
// until a verification admin approves them.
export function HostelRevisionOperations({ actorId }: { actorId: string }) {
  const scope = useOperationScope(actorId, 'hostel-revisions', 'verification');
  const [open, setOpen] = useState<string>();
  const queue = useInfiniteQuery({
    queryKey: [...scope.key, 'queue'],
    initialPageParam: undefined as string | undefined,
    gcTime: 0,
    retry: false,
    queryFn: ({ pageParam, signal }) =>
      scope.read(
        (c) => listHostelRevisions(c, { limit: 20, ...(pageParam ? { cursor: pageParam } : {}) }),
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = queue.isError ? [] : (queue.data?.pages.flatMap((page) => page.data) ?? []);
  return (
    <OperationSection title="Hostel changes">
      <p>Edits to approved hostels. Customers see the current details until you approve.</p>
      <OperationState
        pending={queue.isPending}
        error={queue.error}
        retry={() => void queue.refetch()}
        empty={!rows.length}
      />
      {rows.map((row) => (
        <Button key={row.id} variant="secondary" onClick={() => setOpen(row.id)}>
          Review {row.branchName} · {row.organizationName} · sent {formatDate(row.submittedAt)}
        </Button>
      ))}
      {!queue.isPending && !queue.isError ? (
        <OperationPages
          hasMore={Boolean(queue.hasNextPage)}
          fetching={queue.isFetching}
          more={() => void queue.fetchNextPage()}
          refresh={() => void queue.refetch()}
        />
      ) : null}
      {open ? (
        <RevisionReview key={open} id={open} scope={scope} close={() => setOpen(undefined)} />
      ) : null}
    </OperationSection>
  );
}
function RevisionReview({ id, scope, close }: { id: string; scope: Scope; close: () => void }) {
  const review = useQuery({
    queryKey: [...scope.key, 'review', id],
    gcTime: 0,
    retry: false,
    queryFn: ({ signal }) => scope.read((c) => readHostelRevisionReview(c, id), signal),
  });
  const data = review.data;
  return (
    <div className="space-y-3 border-t border-hsm-border pt-4">
      <Button variant="secondary" onClick={close}>
        Close hostel changes
      </Button>
      <OperationState
        pending={review.isPending}
        error={review.error}
        retry={() => void review.refetch()}
      />
      {data ? (
        <>
          <h4 className="font-semibold">
            {data.branchName} · {data.organizationName}
          </h4>
          <dl className="grid gap-2 sm:grid-cols-3">
            {revisionRows(data).map((row) => (
              <div key={row.key} className="rounded-input border border-hsm-border p-3">
                <dt className="font-semibold">{row.label}</dt>
                <dd>Now: {revisionValue(row.key, row.now, data.placeNames)}</dd>
                <dd className="font-semibold text-hsm-primary">
                  New: {revisionValue(row.key, row.next, data.placeNames)}
                </dd>
              </div>
            ))}
          </dl>
          {data.revision.status === 'submitted' ? (
            <RevisionDecision review={data} scope={scope} done={close} />
          ) : (
            <p>Already decided: {data.revision.status}.</p>
          )}
        </>
      ) : null}
    </div>
  );
}
type Decision = { action: 'approve' } | { action: 'reject'; reason: string };
function RevisionDecision(props: { review: HostelRevisionReview; scope: Scope; done: () => void }) {
  const { revision } = props.review;
  const [choice, setChoice] = useState<'approve' | 'reject'>(),
    [reason, setReason] = useState('');
  const command = useCommand<Decision>(
    'AdminHostelRevision:' + revision.id,
    (input, key) =>
      props.scope.read((c) =>
        decideHostelRevision(c, revision.id, { expectedVersion: revision.version, ...input }, key),
      ),
    [props.scope.key],
  );
  const locked = command.isPending || command.unresolved;
  return (
    <div className="space-y-3">
      <CommandRecovery command={command} />
      {command.error ? <p role="alert">{errorMessage(command.error)}</p> : null}
      {choice === 'reject' ? (
        <label className="field-label">
          Reason for rejecting
          <input
            className="field-input"
            value={reason}
            maxLength={1000}
            disabled={locked}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
      ) : null}
      {choice ? (
        <OperationConfirmation
          label={choice === 'approve' ? 'approve changes · goes live' : 'reject changes'}
          pending={command.isPending}
          disabled={command.unresolved || (choice === 'reject' && !reason.trim())}
          cancel={() => setChoice(undefined)}
          confirm={() =>
            command.mutate(
              choice === 'approve'
                ? { action: 'approve' }
                : { action: 'reject', reason: reason.trim() },
              { onSuccess: props.done },
            )
          }
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button disabled={locked} onClick={() => setChoice('approve')}>
            Approve changes
          </Button>
          <Button variant="secondary" disabled={locked} onClick={() => setChoice('reject')}>
            Reject changes
          </Button>
        </div>
      )}
    </div>
  );
}
