'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { readVisitHistory, formatVisitStart } from '@hsm/api-client';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
export function VisitHistory({
  actorId,
  visitId,
  branchId,
}: {
  actorId: string;
  visitId: string;
  branchId?: string;
}) {
  const [open, setOpen] = useState(false),
    [cursor, setCursor] = useState<string>();
  const query = useQuery({
    queryKey: ['visits', actorId, branchId ?? 'own', visitId, 'history', cursor],
    gcTime: 0,
    retry: false,
    enabled: open,
    queryFn: () => readVisitHistory(browserClient(), visitId, cursor ? { cursor } : {}, branchId),
  });
  return (
    <section className="space-y-3" aria-label="Visit history">
      <Button variant="secondary" onClick={() => setOpen((value) => !value)}>
        {open ? 'Hide visit history' : 'View visit history'}
      </Button>
      {open ? (
        query.isError ? (
          <>
            <p role="alert">{errorMessage(query.error)}</p>
            <Button variant="secondary" onClick={() => void query.refetch()}>
              Refresh history access
            </Button>
          </>
        ) : query.isFetching || query.isPending ? (
          <p role="status">Loading current visit history…</p>
        ) : query.data ? (
          <>
            <p>
              {query.data.branchName} · {query.data.customerName}
            </p>
            {!query.data.data.length ? <p>No history on this page.</p> : null}
            <ol className="space-y-3">
              {query.data.data.map((entry) => (
                <li key={entry.id}>
                  <p>
                    {entry.action.replaceAll('-', ' ')} · {formatVisitStart(entry.createdAt)}
                  </p>
                  <p>Requested: {formatVisitStart(entry.requestedStart)}</p>
                  {entry.proposedStart ? (
                    <p>Proposed: {formatVisitStart(entry.proposedStart)}</p>
                  ) : null}
                  {entry.reason ? <p>{entry.reason}</p> : null}
                </li>
              ))}
            </ol>
            <Button variant="secondary" disabled={!cursor} onClick={() => setCursor(undefined)}>
              First history page
            </Button>
            <Button
              variant="secondary"
              disabled={!query.data.nextCursor}
              onClick={() => {
                if (query.data?.nextCursor) setCursor(query.data.nextCursor);
              }}
            >
              Next history page
            </Button>
          </>
        ) : null
      ) : null}
    </section>
  );
}
