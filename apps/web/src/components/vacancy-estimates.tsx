'use client';
import { useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { listInventoryRoomTypes, readExpectedVacancy } from '@hsm/api-client';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
type Props = { actorId: string; branchId: string; accessUnavailable?: boolean };
export function VacancyEstimates(props: Props) {
  return <Workspace key={props.actorId + ':' + props.branchId} {...props} />;
}
const display = (value: string) =>
  new Date(value + 'T00:00:00Z').toLocaleDateString('en-PK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
// CHG-040 / WAIT-001: a room's "bed frees on" date comes only from a resident's departure
// notice. Nobody types it, and a full room with no notice has no waiting list.
function Workspace({ actorId, branchId, accessUnavailable = false }: Props) {
  const [cursor, setCursor] = useState<string>();
  const types = useQuery({
    queryKey: ['waitlist', actorId, branchId, 'catalogue', cursor],
    retry: false,
    gcTime: 0,
    enabled: !accessUnavailable,
    queryFn: () => listInventoryRoomTypes(browserClient(), branchId, cursor ? { cursor } : {}),
  });
  const rows = types.data?.data ?? [];
  const dates = useQueries({
    queries: rows.map((row) => ({
      queryKey: ['waitlist', actorId, branchId, 'estimate', row.id],
      retry: false,
      gcTime: 0,
      queryFn: () => readExpectedVacancy(browserClient(), branchId, row.id),
    })),
  });
  return (
    <section aria-label="Beds freeing up" className="space-y-3">
      <h3 className="font-semibold">Beds freeing up</h3>
      <p className="text-sm">
        From residents&apos; departure notices. Customers can only wait for these rooms.
      </p>
      {accessUnavailable || types.isError ? (
        <>
          <p role="alert">
            {types.isError ? errorMessage(types.error) : 'Refresh branch access first.'}
          </p>
          <Button
            variant="secondary"
            disabled={accessUnavailable || types.isFetching}
            onClick={() => void types.refetch()}
          >
            Refresh vacancy access
          </Button>
        </>
      ) : types.isPending ? (
        <p role="status">Loading room types…</p>
      ) : (
        <>
          {!rows.length ? <p>No room types yet.</p> : null}
          <ul className="space-y-2">
            {rows.map((row, index) => {
              const vacancy = dates[index],
                date = vacancy?.data?.expectedVacancyDate;
              return (
                <li key={row.id}>
                  <strong>{row.name}</strong>
                  <span className="block text-sm">
                    {!vacancy || vacancy.isPending
                      ? 'Checking…'
                      : vacancy.isError
                        ? errorMessage(vacancy.error)
                        : date
                          ? 'Bed frees on ' + display(date)
                          : 'No one on notice'}
                  </span>
                </li>
              );
            })}
          </ul>
          {cursor || types.data?.nextCursor ? (
            <div className="flex gap-2">
              <Button variant="secondary" disabled={!cursor} onClick={() => setCursor(undefined)}>
                First estimate room-type page
              </Button>
              <Button
                variant="secondary"
                disabled={!types.data?.nextCursor}
                onClick={() => setCursor(types.data?.nextCursor ?? undefined)}
              >
                Next estimate room-type page
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
