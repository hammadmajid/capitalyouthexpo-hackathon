'use client';
import { useQuery } from '@tanstack/react-query';
import { readBedOccupancy } from '@hsm/api-client';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
import { StayRecordPanel } from './stay-record';
import { BedRent } from './bed-rent';
import { BedHistory } from './residents/bed-history';
const source = {
  assignment: 'Resident assignment (occupancy)',
  block: 'Inventory block',
  booking: 'Booking reservation',
  hold: 'Temporary booking hold',
};
// BED-002: an occupied bed opens its authorized Stay; reservations stay distinct.
export function BedDetail(props: {
  actorId: string;
  branchId: string;
  bedId: string;
  on: string;
  close: () => void;
}) {
  const detail = useQuery({
    queryKey: ['bed-detail', props.actorId, props.branchId, props.bedId, props.on],
    gcTime: 0,
    retry: false,
    queryFn: () =>
      readBedOccupancy(
        browserClient(),
        props.branchId,
        props.bedId,
        props.on ? { on: props.on } : {},
      ),
  });
  if (detail.isPending) return <p role="status">Loading bed details…</p>;
  if (detail.isError) return <p role="alert">{errorMessage(detail.error)}</p>;
  const data = detail.data;
  return (
    <section
      aria-label="Bed details"
      className="space-y-2 rounded-input border border-hsm-border p-4"
    >
      <h3 className="font-semibold">
        {data.room.roomTypeName} · Room {data.room.label} · Bed {data.bed.label}
      </h3>
      <p>
        On {data.on}: {data.bed.state}
        {data.bed.occupant ? ' — ' + data.bed.occupant.displayName : ''}
      </p>
      {data.claims.length === 0 ? <p>No live claims cover this bed on this date.</p> : null}
      <ul>
        {data.claims.map((claim, index) => (
          <li key={index}>
            {source[claim.source]}
            {claim.wholeRoom ? ' (whole room)' : ''}: {claim.moveInDate} to{' '}
            {claim.moveOutDate ?? 'open-ended'}
          </li>
        ))}
      </ul>
      <BedRent actorId={props.actorId} branchId={props.branchId} bedId={props.bedId} />
      {data.bed.occupant ? (
        <StayRecordPanel
          actorId={props.actorId}
          branchId={props.branchId}
          stayId={data.bed.occupant.stayId}
        />
      ) : null}
      <BedHistory actorId={props.actorId} branchId={props.branchId} bedId={props.bedId} />
      <Button variant="ghost" onClick={props.close}>
        Close bed details
      </Button>
    </section>
  );
}
