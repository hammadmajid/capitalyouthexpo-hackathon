'use client';
import { useQuery } from '@tanstack/react-query';
import { readVisitInterest } from '@hsm/api-client';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
import type { useVisitCommand } from './use-visit-command';
export function VisitInterest({
  operation,
  actorId,
  visitId,
  branchId,
}: {
  operation: ReturnType<typeof useVisitCommand>;
  actorId: string;
  visitId: string;
  branchId?: string;
}) {
  const { mutation, locked } = operation;
  const ownCommand = operation.kind === 'interest' && operation.targetVisitId === visitId;
  const query = useQuery({
    queryKey: ['visits', actorId, branchId ?? 'own', visitId, 'interest'],
    gcTime: 0,
    retry: false,
    queryFn: () => readVisitInterest(browserClient(), visitId, branchId),
  });
  if (query.isError)
    return (
      <>
        <p role="alert">{errorMessage(query.error)}</p>
        <Button variant="secondary" onClick={() => void query.refetch()}>
          Refresh visit response access
        </Button>
      </>
    );
  if (query.isPending || query.isFetching || !query.data)
    return <p role="status">Loading current visit response…</p>;
  const state = query.data;
  function respond(stillInterested: boolean) {
    mutation.mutate({
      kind: 'interest',
      visitId,
      body: { expectedUpdatedAt: state.expectedUpdatedAt, stillInterested },
    });
  }
  return (
    <section aria-label="Post-visit interest" className="space-y-3">
      <p>
        {state.stillInterested === null
          ? branchId
            ? 'Customer has not responded after this visit.'
            : 'After your visit, are you still interested in this hostel?'
          : state.stillInterested
            ? 'Customer remains interested.'
            : 'Customer is no longer interested.'}
      </p>
      {!branchId ? (
        <>
          <Button disabled={locked || state.stillInterested === true} onClick={() => respond(true)}>
            Still interested
          </Button>
          <Button
            variant="secondary"
            disabled={locked || state.stillInterested === false}
            onClick={() => respond(false)}
          >
            Not interested
          </Button>
        </>
      ) : null}
      {ownCommand && mutation.error ? <p role="alert">{errorMessage(mutation.error)}</p> : null}
      {ownCommand && locked && !mutation.isPending ? (
        <Button onClick={() => mutation.mutate(undefined)}>Retry original visit response</Button>
      ) : null}
      {ownCommand && mutation.isSuccess ? <p role="status">Visit response saved.</p> : null}
    </section>
  );
}
