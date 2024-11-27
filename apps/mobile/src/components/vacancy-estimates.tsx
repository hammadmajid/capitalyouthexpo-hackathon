import { Skeleton } from './loading/skeleton';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { CalendarClock } from 'lucide-react-native';
import { useQueries, useQuery } from '@tanstack/react-query';
import { listInventoryRoomTypes, readExpectedVacancy } from '@hsm/api-client';
import { mobileColors as c, mobileSurfaces } from '@hsm/ui';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { formatDate } from './date-field';
import { ListPager } from './list-pager';
import { Copy } from './ui';
type Props = { actorId: string; branchId: string; accessUnavailable?: boolean };
export function VacancyEstimates(props: Props) {
  return <Workspace key={props.actorId + ':' + props.branchId} {...props} />;
}
// CHG-040 / WAIT-001: a room's "bed frees on" date comes only from a resident's departure
// notice. Nobody types it, and a full room with no notice has no waiting list.
function Workspace({ actorId, branchId, accessUnavailable = false }: Props) {
  const [cursor, setCursor] = useState<string>();
  const types = useQuery({
    queryKey: ['waitlist', actorId, branchId, 'catalogue', cursor],
    retry: false,
    gcTime: 0,
    enabled: !accessUnavailable,
    queryFn: async () =>
      listInventoryRoomTypes(await actorClient(actorId), branchId, cursor ? { cursor } : {}),
  });
  const rows = types.data?.data ?? [];
  const dates = useQueries({
    queries: rows.map((row) => ({
      queryKey: ['waitlist', actorId, branchId, 'estimate', row.id],
      retry: false,
      gcTime: 0,
      queryFn: async () => readExpectedVacancy(await actorClient(actorId), branchId, row.id),
    })),
  });
  return (
    <View
      style={mobileSurfaces.icyCard}
      className="gap-3 rounded-card border border-cardBorder p-4 frosted-card"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <CalendarClock color={c.primary} size={22} />
        <Text style={{ flex: 1, color: c.heading, fontSize: 17, fontWeight: '700' }}>
          Beds freeing up
        </Text>
      </View>
      <Text style={{ color: c.secondary, fontSize: 13 }}>
        From residents&apos; departure notices. Customers can only wait for these rooms.
      </Text>
      {accessUnavailable || types.isError ? (
        <>
          <Copy alert>
            {types.isError ? safeMessage(types.error) : 'Pull down to load branch access.'}
          </Copy>
        </>
      ) : types.isPending ? (
        <Skeleton kind="list" label="Loading room types…" />
      ) : (
        <>
          {!rows.length ? <Copy>No room types yet.</Copy> : null}
          {rows.map((row, index) => (
            <RoomRow key={row.id} name={row.name} vacancy={dates[index]} />
          ))}
          <ListPager
            first="First estimate room-type page"
            next="Next estimate room-type page"
            hasPrevious={Boolean(cursor)}
            hasNext={Boolean(types.data?.nextCursor)}
            onFirst={() => setCursor(undefined)}
            onNext={() => setCursor(types.data?.nextCursor ?? undefined)}
          />
        </>
      )}
    </View>
  );
}
type Vacancy = {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  data?: { expectedVacancyDate: string | null } | undefined;
};
function RoomRow(props: { name: string; vacancy: Vacancy | undefined }) {
  const [title, ...rest] = props.name.split(' · ');
  const date = props.vacancy?.data?.expectedVacancyDate;
  const state =
    !props.vacancy || props.vacancy.isPending
      ? 'Checking…'
      : props.vacancy.isError
        ? safeMessage(props.vacancy.error)
        : date
          ? 'Bed frees on ' + formatDate(date)
          : 'No one on notice';
  return (
    <View
      accessible
      accessibilityLabel={props.name + ': ' + state}
      style={{ borderTopWidth: 1, borderColor: c.border, paddingTop: 10, gap: 2 }}
    >
      <Text style={{ color: c.heading, fontWeight: '700', fontSize: 15 }}>{title}</Text>
      {rest.length ? (
        <Text style={{ color: c.secondary, fontSize: 13 }}>{rest.join(' · ')}</Text>
      ) : null}
      <Text style={{ color: date ? c.primary : c.secondary, fontSize: 13, fontWeight: '600' }}>
        {state}
      </Text>
    </View>
  );
}
