'use client';
import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { readBedHistory } from '@hsm/api-client';
import { formatDate } from '@hsm/contracts';
import { browserClient } from '../../lib/client';
import { errorMessage } from '../../lib/messages';
import { StayRecordPanel } from '../stay-record';
import { Button } from '../ui/button';
type Props = { actorId: string; branchId: string; bedId: string };
// RES-005 / CHG-048: every assignment on this bed, newest first, so a transfer reads as one stay
// ending here and starting on its new bed. Each row opens its original Stay, including residents
// who already left.
export function BedHistory({ actorId, branchId, bedId }: Props) {
  const [stayId, setStayId] = useState<string>();
  const history = useInfiniteQuery({
    queryKey: ['bed-history', actorId, branchId, bedId],
    initialPageParam: undefined as string | undefined,
    retry: false,
    queryFn: ({ pageParam }) =>
      readBedHistory(browserClient(), branchId, bedId, {
        limit: 20,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = history.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <section aria-label="Bed history" className="space-y-2">
      <h4 className="font-semibold">Bed history</h4>
      {history.isPending ? <p role="status">Loading occupancy history…</p> : null}
      {history.error ? <p role="alert">{errorMessage(history.error)}</p> : null}
      {history.isSuccess && rows.length === 0 ? <p>No one has stayed here yet.</p> : null}
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.assignmentId}>
            <Button variant="secondary" onClick={() => setStayId(row.stayId)}>
              {(row.endedAt ? '' : 'Now · ') +
                row.residentName +
                (row.wholeRoom ? ' · Whole room' : '') +
                ' · in ' +
                formatDate(row.startedAt) +
                ' — ' +
                (row.endedAt ? 'left ' + formatDate(row.endedAt) : 'still here')}
            </Button>
          </li>
        ))}
      </ul>
      {history.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={history.isFetchingNextPage}
          onClick={() => void history.fetchNextPage()}
        >
          More history
        </Button>
      ) : null}
      {stayId ? (
        <>
          <StayRecordPanel actorId={actorId} branchId={branchId} stayId={stayId} />
          <Button variant="ghost" onClick={() => setStayId(undefined)}>
            Close past stay
          </Button>
        </>
      ) : null}
    </section>
  );
}
