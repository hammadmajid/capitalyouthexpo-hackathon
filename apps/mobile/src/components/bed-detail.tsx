import { useState } from 'react';
import { AppHeader } from './navigation/header';
import { Skeleton } from './loading/skeleton';
import { View } from 'react-native';
import { CalendarRange, MapPin } from 'lucide-react-native';
import { InvFact } from './inventory-tools';
import { BedStatusBadge } from './bed-board-parts';
import { BedSections } from './bed-sections';
import { useQuery } from '@tanstack/react-query';
import { readBedOccupancy } from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { Copy } from './ui';
import { BedActions } from './bed-actions';
import { BedResidentCard } from './bed-resident-card';
import { StaffStayWorkspace } from './staff-stay-workspace';
const source = {
  assignment: 'Resident assignment (occupancy)',
  block: 'Inventory block',
  booking: 'Booking reservation',
  hold: 'Temporary booking hold',
};
const states: Record<string, string> = {
  available: 'Available',
  occupied: 'Occupied',
  reserved: 'Reserved',
  blocked: 'Blocked',
  unavailable: 'Off',
};
// BED-002: an occupied bed opens its authorized Stay; reservations stay distinct.
export function NativeBedDetail(props: {
  actorId: string;
  branchId: string;
  bedId: string;
  on: string;
  close: () => void;
  inRoom?: boolean;
  // The Bed Board names beds by room and B-number ("Room T-101 · B1").
  title?: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [panel, setPanel] = useState(false);
  const [section, setSection] = useState(false);
  const detail = useQuery({
    queryKey: ['bed-detail', props.actorId, props.branchId, props.bedId, props.on],
    gcTime: 0,
    retry: false,
    queryFn: async () =>
      readBedOccupancy(
        await actorClient(props.actorId),
        props.branchId,
        props.bedId,
        props.on ? { on: props.on } : {},
      ),
  });
  if (detail.isPending || detail.isError)
    return (
      <View className="gap-2">
        <AppHeader title="Bed details" backLabel="Close bed details" onBack={props.close} />
        {detail.isError ? (
          <>
            <Copy alert>{safeMessage(detail.error)}</Copy>
          </>
        ) : (
          <Skeleton kind="details" label="Loading bed details" />
        )}
      </View>
    );
  const data = detail.data;
  const stayId = data.bed.occupant?.stayId ?? null;
  return (
    <>
      <View
        className="gap-4"
        accessibilityLabel="Bed details"
        style={{ display: selected ? 'none' : 'flex' }}
        accessibilityElementsHidden={Boolean(selected)}
        importantForAccessibility={selected ? 'no-hide-descendants' : 'auto'}
      >
        {section ? null : (
          <>
            <View className="gap-1">
              <AppHeader
                title={props.title ?? 'Bed ' + data.bed.label}
                backLabel="Close bed details"
                onBack={props.close}
              />
              {/* Inside a room screen the location is already on screen. */}
              {props.inRoom ? null : (
                <InvFact Icon={MapPin}>
                  {[data.location?.building?.name, data.location?.floor?.label]
                    .filter(Boolean)
                    .join(' · ') || 'Room ' + data.room.label}
                </InvFact>
              )}
            </View>
            {/* CHG-048: status first, in the same colour as the bed on the board. */}
            <BedStatusBadge bed={data.bed} />
            {props.on ? <InvFact Icon={CalendarRange}>On {data.on}</InvFact> : null}
            {data.bed.occupant ? (
              <BedResidentCard
                name={data.bed.occupant.displayName}
                since={
                  data.claims.find(
                    (claim) => claim.source === 'assignment' && claim.stayId === stayId,
                  )?.moveInDate
                }
                onOpen={() => setSelected(stayId)}
              />
            ) : null}
            {data.claims
              .filter((claim) => !(data.bed.occupant && claim.source === 'assignment'))
              .map((claim, index) => (
                <InvFact key={index} Icon={CalendarRange}>
                  {source[claim.source]}
                  {claim.wholeRoom ? ' (whole room)' : ''}: {claim.moveInDate} to{' '}
                  {claim.moveOutDate ?? 'open-ended'}
                </InvFact>
              ))}
            {data.bed.state === 'available' || data.bed.state === 'unavailable' ? (
              <BedActions
                onPanel={setPanel}
                actorId={props.actorId}
                branchId={props.branchId}
                bedId={props.bedId}
                roomId={data.room.id}
                roomOn={data.room.status === 'active'}
                bedOff={
                  data.bed.state === 'unavailable' &&
                  (data.bed.status !== 'active' || data.room.status !== 'active')
                }
                blockedReason={
                  data.bed.state === 'available'
                    ? undefined
                    : data.bed.state === 'unavailable'
                      ? 'Turn bed on first'
                      : 'Bed is ' + (states[data.bed.state] ?? data.bed.state).toLowerCase()
                }
              />
            ) : null}
          </>
        )}
        {panel ? null : (
          <BedSections
            actorId={props.actorId}
            branchId={props.branchId}
            bedId={props.bedId}
            roomId={data.room.id}
            stayId={stayId}
            upcoming={data.upcoming ?? []}
            onOpenStay={setSelected}
            onOpenChange={setSection}
          />
        )}
      </View>
      {selected ? (
        <StaffStayWorkspace
          actorId={props.actorId}
          branchId={props.branchId}
          stayId={selected}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}
