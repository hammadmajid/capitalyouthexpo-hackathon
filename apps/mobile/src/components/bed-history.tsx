import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CalendarClock, ChevronRight, History, User, type LucideIcon } from 'lucide-react-native';
import { mobileColors as colors, mobileSurfaces } from '@hsm/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import { readBedHistory } from '@hsm/api-client';
import { formatDate, type BedOccupancy } from '@hsm/contracts';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { Button, Copy } from './ui';
import { Skeleton } from './loading/skeleton';
import { StaffStayWorkspace } from './staff-stay-workspace';
type Claim = NonNullable<BedOccupancy['upcoming']>[number];
const coming: Record<Claim['source'], string> = {
  assignment: 'Planned move-in',
  block: 'Blocked',
  booking: 'Booking',
  hold: 'Booking hold',
};
// RES-005 / CHG-048: coming next (earliest first), then every assignment newest first, so a
// transfer reads as one stay ending here and starting on its new bed. Each row opens its
// original Stay (rent history, payments and proofs), including departed residents.
export function NativeBedHistory(props: {
  actorId: string;
  branchId: string;
  bedId: string;
  onOpenStay?: (stayId: string) => void;
  upcoming?: Claim[];
  // Opened from the bed's History tile, whose header already says "History".
  hideTitle?: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const history = useInfiniteQuery({
    queryKey: ['bed-history', props.actorId, props.branchId, props.bedId],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      readBedHistory(await actorClient(props.actorId), props.branchId, props.bedId, {
        limit: 20,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });
  const rows = history.data?.pages.flatMap((page) => page.data) ?? [];
  const open = (stayId: string) =>
    props.onOpenStay ? props.onOpenStay(stayId) : setSelected(stayId);
  if (selected)
    return (
      <StaffStayWorkspace
        actorId={props.actorId}
        branchId={props.branchId}
        stayId={selected}
        onClose={() => setSelected(null)}
      />
    );
  return (
    <View className="gap-2" accessibilityLabel="Occupancy history">
      {props.hideTitle ? null : (
        <View className="flex-row items-center gap-2">
          <History size={20} color={colors.primary} />
          <Text className="flex-1 font-heading text-body text-heading">Bed history</Text>
        </View>
      )}
      {history.data && rows.length === 0 && !props.upcoming?.length ? (
        <Copy>No one has stayed here yet</Copy>
      ) : null}
      {props.upcoming?.map((claim, index) => (
        <HistoryCard
          key={'upcoming-' + index}
          Icon={CalendarClock}
          title={'Coming · ' + coming[claim.source] + (claim.wholeRoom ? ' · Whole room' : '')}
          dates={
            formatDate(claim.moveInDate + 'T00:00:00.000Z') +
            ' — ' +
            (claim.moveOutDate ? formatDate(claim.moveOutDate + 'T00:00:00.000Z') : 'open-ended')
          }
          {...(claim.stayId ? { onPress: () => open(claim.stayId ?? '') } : {})}
        />
      ))}
      {history.isPending ? <Skeleton kind="list" label="Loading occupancy history" /> : null}
      {history.isError ? (
        <View>
          <Copy alert>{safeMessage(history.error)}</Copy>
        </View>
      ) : null}
      {rows.map((row) => (
        <HistoryCard
          key={row.assignmentId}
          Icon={row.endedAt ? History : User}
          title={
            (row.endedAt ? '' : 'Now · ') +
            row.residentName +
            (row.wholeRoom ? ' · Whole room' : '')
          }
          dates={
            'In ' +
            formatDate(row.startedAt) +
            ' — ' +
            (row.endedAt ? 'left ' + formatDate(row.endedAt) : 'still here')
          }
          onPress={() => open(row.stayId)}
        />
      ))}
      {history.hasNextPage ? (
        <Button
          secondary
          label={history.isFetchingNextPage ? 'Loading history' : 'More history'}
          disabled={history.isFetchingNextPage}
          onPress={() => void history.fetchNextPage()}
        />
      ) : null}
    </View>
  );
}
// One entry: icon, who, dates; a chevron when it opens the original Stay.
function HistoryCard(props: {
  Icon: LucideIcon;
  title: string;
  dates: string;
  onPress?: () => void;
}) {
  const card = (
    <View style={[mobileSurfaces.icyCard, styles.card]}>
      <props.Icon size={24} color={colors.primary} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text className="font-heading" numberOfLines={1} style={styles.title}>
          {props.title}
        </Text>
        <Text className="font-body" numberOfLines={1} style={styles.dates}>
          {props.dates}
        </Text>
      </View>
      {props.onPress ? <ChevronRight size={22} color={colors.primary} /> : null}
    </View>
  );
  if (!props.onPress) return card;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.title + ', ' + props.dates}
      onPress={props.onPress}
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      {card}
    </Pressable>
  );
}
const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  title: { color: colors.heading, fontSize: 16, fontWeight: '700' },
  dates: { color: colors.secondary, fontSize: 14 },
});
