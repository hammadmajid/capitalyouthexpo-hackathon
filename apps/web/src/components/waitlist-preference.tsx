'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listPublicInventoryRoomTypes } from '@hsm/api-client';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
export function WaitlistPreference({
  branchId,
  disabled,
  choose,
}: {
  branchId: string;
  disabled: boolean;
  choose: (value: { id: string; name: string } | null) => void;
}) {
  const [open, setOpen] = useState(false),
    [cursor, setCursor] = useState<string>();
  const query = useQuery({
    queryKey: ['waitlist-room-types', branchId, cursor],
    retry: false,
    enabled: open,
    queryFn: () =>
      listPublicInventoryRoomTypes(browserClient(), branchId, cursor ? { cursor } : {}),
  });
  return (
    <div className="space-y-2">
      <Button variant="secondary" disabled={disabled} onClick={() => setOpen(!open)}>
        {open ? 'Hide waiting-list preferences' : 'Choose waiting-list room type'}
      </Button>
      {open ? (
        <>
          <Button variant="secondary" disabled={disabled} onClick={() => choose(null)}>
            Any room type
          </Button>
          {query.isError ? (
            <>
              <p role="alert">{errorMessage(query.error)}</p>
              <Button disabled={disabled} onClick={() => void query.refetch()}>
                Refresh waiting-list room types
              </Button>
            </>
          ) : query.isPending || query.isFetching ? (
            <p role="status">Loading waiting-list room types…</p>
          ) : (
            <>
              {query.data?.data.map((row) => (
                <Button
                  key={row.id}
                  variant="secondary"
                  disabled={disabled}
                  onClick={() => choose({ id: row.id, name: row.name })}
                >
                  {row.name}: join preference
                </Button>
              ))}
              {!query.data?.data.length ? <p>No published room types on this page.</p> : null}
              <Button
                variant="secondary"
                disabled={disabled || !cursor}
                onClick={() => setCursor(undefined)}
              >
                First waiting-list room-type page
              </Button>
              <Button
                variant="secondary"
                disabled={disabled || !query.data?.nextCursor}
                onClick={() => setCursor(query.data?.nextCursor ?? undefined)}
              >
                Next waiting-list room-type page
              </Button>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
