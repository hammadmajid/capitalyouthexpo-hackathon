'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listBranchWaitlist, listOwnWaitlist } from '@hsm/api-client';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
import { useWaitlistCommand } from './use-waitlist-command';
import { VacancyEstimates } from './vacancy-estimates';
type Props = { actorId: string; branchId?: string; accessUnavailable?: boolean };
export function Waitlist(props: Props) {
  return <Workspace key={props.actorId + ':' + (props.branchId ?? 'own')} {...props} />;
}
function Workspace({ actorId, branchId, accessUnavailable = false }: Props) {
  const [open, setOpen] = useState(false),
    [cursor, setCursor] = useState<string>();
  const { mutation, locked } = useWaitlistCommand(actorId);
  const query = useQuery({
    queryKey: ['waitlist', actorId, branchId ?? 'own', cursor],
    gcTime: 0,
    retry: false,
    enabled: open && !accessUnavailable,
    queryFn: () =>
      branchId
        ? listBranchWaitlist(browserClient(), branchId, cursor ? { cursor } : {})
        : listOwnWaitlist(browserClient(), cursor ? { cursor } : {}),
  });
  return (
    <section
      id={branchId ? undefined : 'waiting-list'}
      aria-label={branchId ? 'Hostel waiting list' : 'My waiting list'}
      className="space-y-3"
    >
      <Button variant="secondary" disabled={locked} onClick={() => setOpen(!open)}>
        {open ? 'Close waiting list' : branchId ? 'Manage waiting list' : 'My waiting list'}
      </Button>
      {mutation.error ? <p role="alert">{errorMessage(mutation.error)}</p> : null}
      {branchId && open ? (
        <VacancyEstimates
          actorId={actorId}
          branchId={branchId}
          accessUnavailable={accessUnavailable || query.isError}
        />
      ) : null}
      {locked && !mutation.isPending ? (
        <Button disabled={accessUnavailable} onClick={() => mutation.mutate(undefined)}>
          Retry original leave request
        </Button>
      ) : null}
      {open ? (
        accessUnavailable || query.isError ? (
          <>
            <p role="alert">
              {accessUnavailable
                ? 'Refresh branch access before continuing.'
                : errorMessage(query.error)}
            </p>
            <Button onClick={() => void query.refetch()}>Refresh waiting list</Button>
          </>
        ) : query.isPending || query.isFetching ? (
          <p role="status">Loading current waiting list…</p>
        ) : (
          <>
            {!query.data?.data.length ? <p>No waiting-list entries on this page.</p> : null}
            {query.data?.data.map((row) => (
              <article key={row.id} className="space-y-2 rounded-card border border-hsm-border p-4">
                <h3>
                  {row.branchName} — {row.roomTypeName ?? 'Any room type'}
                </h3>
                {'customerName' in row ? <p>{String(row.customerName)}</p> : null}
                <p>{row.leftAt ? 'Left waiting list' : 'Waiting for availability'}</p>
                {row.expectedVacancyDate ? (
                  <p>
                    A resident plans to leave on {row.expectedVacancyDate}. This is not guaranteed
                    availability.
                  </p>
                ) : null}
                {!branchId && row.leftAt === null ? (
                  <Button
                    disabled={locked}
                    onClick={() => mutation.mutate({ kind: 'leave', entryId: row.id })}
                  >
                    Leave waiting list
                  </Button>
                ) : null}
              </article>
            ))}
            <Button
              variant="secondary"
              disabled={locked || !cursor}
              onClick={() => setCursor(undefined)}
            >
              First waiting-list page
            </Button>
            <Button
              variant="secondary"
              disabled={locked || !query.data?.nextCursor}
              onClick={() => setCursor(query.data?.nextCursor ?? undefined)}
            >
              Next waiting-list page
            </Button>
          </>
        )
      ) : null}
    </section>
  );
}
