'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { bedOccupancyStateSchema, type BedOccupancyState } from '@hsm/contracts';
import { readBranchOccupancy, readInventoryAccess } from '@hsm/api-client';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
import { bedStatusText, bedTone, bedToneClass } from '../lib/bed-tone';
import { BedDetail } from './bed-detail';
// Status is spelled out in text, never shown by colour alone.
const labels: Record<BedOccupancyState, string> = {
  occupied: 'Occupied',
  blocked: 'Blocked',
  reserved: 'Reserved',
  unavailable: 'Unavailable',
  available: 'Available',
};
export function BedBoard(props: { actorId: string; branchId: string }) {
  return <Board key={props.actorId + ':' + props.branchId} {...props} />;
}
// BED-001 / RES-004: read-only Bed Board from authoritative server occupancy. Every open
// and refresh reads the server again; nothing is inferred from cached booking data.
function Board({ actorId, branchId }: { actorId: string; branchId: string }) {
  const [open, setOpen] = useState(false),
    [on, setOn] = useState(''),
    [cursor, setCursor] = useState<string>(),
    [state, setState] = useState<BedOccupancyState>(),
    [bed, setBed] = useState<string>();
  const access = useQuery({
    queryKey: ['inventory-access', actorId, branchId],
    gcTime: 0,
    queryFn: () => readInventoryAccess(browserClient(), branchId),
  });
  const allowed = access.data?.permissions.includes('stay_manage') ?? false;
  const query = useQuery({
    queryKey: ['bed-board', actorId, branchId, on, state, cursor],
    enabled: open && allowed,
    gcTime: 0,
    retry: false,
    queryFn: () =>
      readBranchOccupancy(browserClient(), branchId, {
        limit: 20,
        ...(on ? { on } : {}),
        ...(cursor ? { cursor } : {}),
        ...(state ? { state } : {}),
      }),
  });
  if (!allowed) return null;
  if (!open)
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        View Bed Board
      </Button>
    );
  const page = query.data;
  return (
    <section aria-label="Bed Board" className="space-y-4">
      <h2 className="text-xl font-semibold">Bed Board</h2>
      <label className="field-label">
        Occupancy date (blank for today)
        <input
          type="date"
          aria-label="Occupancy date"
          value={on}
          onChange={(event) => {
            setOn(event.target.value);
            setCursor(undefined);
          }}
        />
      </label>
      <label className="field-label">
        Show beds
        <select
          aria-label="Bed state filter"
          value={state ?? ''}
          onChange={(event) => {
            const parsed = bedOccupancyStateSchema.safeParse(event.target.value);
            setState(parsed.success ? parsed.data : undefined);
            setCursor(undefined);
          }}
        >
          <option value="">All beds</option>
          {Object.entries(labels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {query.isPending ? <p role="status">Loading occupancy…</p> : null}
      {query.isError ? <p role="alert">{errorMessage(query.error)}</p> : null}
      {page ? (
        <>
          <p role="status">
            {page.on}: {page.totals.beds} beds · {page.totals.occupied} occupied ·{' '}
            {page.totals.reserved} reserved · {page.totals.blocked} blocked ·{' '}
            {page.totals.unavailable} unavailable · {page.totals.available} available
          </p>
          <ul className="space-y-3">
            {page.data.map((room) => (
              <li key={room.id}>
                <h3 className="font-semibold">
                  Room {room.label}
                  {room.status === 'active' ? '' : ' (' + room.status + ')'}
                </h3>
                {room.beds.length === 0 ? <p>No individual beds.</p> : null}
                <ul>
                  {room.beds.map((bed) => (
                    <li key={bed.id} className="flex flex-wrap items-center gap-2">
                      {/* CHG-048: the rent colour comes from server invoice balances only. */}
                      <span
                        className={
                          'rounded-full border-2 px-2 text-xs font-semibold ' +
                          (bedToneClass[bedTone(bed)] ?? 'border-hsm-border')
                        }
                      >
                        {bedStatusText(bed)}
                      </span>
                      <span>
                        Bed {bed.label}: {labels[bed.state]}
                        {bed.occupant ? ' — ' + bed.occupant.displayName : ''}
                      </span>
                      <Button
                        variant="ghost"
                        onClick={() => setBed(bed.id)}
                        aria-label={'Details for room ' + room.label + ' bed ' + bed.label}
                      >
                        Details
                      </Button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            {cursor ? (
              <Button variant="secondary" onClick={() => setCursor(undefined)}>
                First rooms
              </Button>
            ) : null}
            {page.nextCursor ? (
              <Button variant="secondary" onClick={() => setCursor(page.nextCursor ?? undefined)}>
                Next rooms
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
      {bed ? (
        <BedDetail
          actorId={actorId}
          branchId={branchId}
          bedId={bed}
          on={on}
          close={() => setBed(undefined)}
        />
      ) : null}
      <Button variant="secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>
        Refresh Bed Board
      </Button>
      <Button variant="ghost" onClick={() => setOpen(false)}>
        Close Bed Board
      </Button>
    </section>
  );
}
