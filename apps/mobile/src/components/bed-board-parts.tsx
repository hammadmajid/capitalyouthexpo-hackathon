import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  BedDouble,
  Bookmark,
  FileImage,
  CalendarCheck,
  CalendarClock,
  CalendarX,
  Circle,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import {
  bedBoardColors as b,
  mobileColors,
  mobileOwnerColors as c,
  mobileSurfaces,
  ownerMetrics as m,
} from '@hsm/ui';
import {
  bedStatusText,
  bedTone,
  toneLabel,
  type BedTone,
  type BoardRoom,
  type BoardStats,
} from './bed-board-model';
const fills: Record<BedTone, { fill: string; edge: string; text: string }> = {
  paid: { fill: b.paid, edge: b.paidEdge, text: b.onPaid },
  due: { fill: b.due, edge: b.dueEdge, text: b.onDue },
  overdue: { fill: b.overdue, edge: b.overdueEdge, text: b.onOverdue },
  proof: { fill: b.proof, edge: b.proofEdge, text: b.onProof },
  reserved: { fill: b.reserved, edge: b.reservedEdge, text: b.onReserved },
  vacant: { fill: b.vacant, edge: b.vacantEdge, text: b.onVacant },
  occupied: { fill: b.occupied, edge: b.occupiedEdge, text: b.onOccupied },
  held: { fill: b.held, edge: b.heldEdge, text: b.onHeld },
  off: { fill: b.held, edge: b.heldEdge, text: b.onHeld },
};
// The reference shows B1..Bn; long setup labels (T-101-A) stay in the spoken label and sheet.
export function bedShortLabel(bed: { ordinal: number }) {
  return 'B' + bed.ordinal;
}
// The bed's status as one large pill in the same colour as its circle on the board.
export function BedStatusBadge(props: {
  bed: Pick<BoardRoom['beds'][number], 'state' | 'rentStatus'>;
}) {
  const tone = bedTone(props.bed);
  const colour = fills[tone];
  // The resident card shows the bed is taken, so the badge only names the rent state.
  const text = tone === 'occupied' ? bedStatusText(props.bed) : toneLabel[tone];
  return (
    <View
      accessible
      accessibilityLabel={'Status: ' + bedStatusText(props.bed)}
      style={[styles.badge, { backgroundColor: colour.fill, borderColor: colour.edge }]}
    >
      <Text
        className="font-heading"
        numberOfLines={1}
        style={[styles.badgeText, { color: colour.text }]}
      >
        {text}
      </Text>
    </View>
  );
}
export function BedCircle(props: {
  bed: BoardRoom['beds'][number];
  room: string;
  onPress: () => void;
}) {
  const tone = bedTone(props.bed),
    colour = fills[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        'Room ' + props.room + ', bed ' + props.bed.label + ', ' + bedStatusText(props.bed)
      }
      onPress={props.onPress}
      hitSlop={4}
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <View
        style={[
          styles.circle,
          { backgroundColor: colour.fill, borderColor: colour.edge },
          tone === 'off' && styles.dashed,
        ]}
      >
        <Text
          className="font-heading"
          numberOfLines={1}
          style={[styles.circleText, { color: colour.text }]}
        >
          {bedShortLabel(props.bed)}
        </Text>
      </View>
    </Pressable>
  );
}
export function RoomCard(props: { room: BoardRoom; onBed: (bedId: string) => void }) {
  const count = props.room.beds.length;
  return (
    <View style={[styles.card, styles.room]} accessibilityLabel={'Room ' + props.room.label}>
      <View style={styles.roomHead}>
        <BedDouble size={24} color={c.primary} />
        <Text className="font-heading" numberOfLines={1} style={styles.roomName}>
          Room {props.room.label}
        </Text>
        {/* The circles already show how many beds; no repeated count. */}
      </View>
      <View style={styles.beds}>
        {props.room.beds.map((bed) => (
          <BedCircle
            key={bed.id}
            bed={bed}
            room={props.room.label}
            onPress={() => props.onBed(bed.id)}
          />
        ))}
        {count === 0 ? (
          <Text className="font-body" numberOfLines={1} style={styles.muted}>
            No beds yet
          </Text>
        ) : null}
      </View>
    </View>
  );
}
type Stat = {
  key: string;
  value: number;
  label: string;
  Icon: LucideIcon;
  tint?: string;
  edge?: string;
};
export function BoardStatsRow({ stats }: { stats: BoardStats }) {
  const items: Stat[] = [
    { key: 'beds', value: stats.beds, label: 'Total Beds', Icon: BedDouble },
    { key: 'occupied', value: stats.occupied, label: 'Occupied', Icon: Users },
    { key: 'vacant', value: stats.vacant, label: 'Vacant', Icon: Circle },
    {
      key: 'reserved',
      value: stats.reserved,
      label: 'Reserved',
      Icon: Bookmark,
      tint: b.held,
      edge: b.reservedEdge,
    },
  ];
  // Rent counts: a second row, only for finance_view holders.
  const rent: Stat[] = [
    ...(stats.finance
      ? [
          {
            key: 'paid',
            value: stats.paid,
            label: 'Paid',
            Icon: CalendarCheck,
            tint: b.paidSoft,
            edge: b.paid,
          },
          {
            key: 'due',
            value: stats.due,
            label: 'Due',
            Icon: CalendarClock,
            tint: b.dueSoft,
            edge: b.dueEdge,
          },
          {
            key: 'overdue',
            value: stats.overdue,
            label: 'Overdue',
            Icon: CalendarX,
            edge: b.overdue,
          },
          {
            key: 'proof',
            value: stats.proof,
            label: 'Proof sent',
            Icon: FileImage,
            edge: b.proofEdge,
          },
        ]
      : []),
  ];
  return (
    <View style={styles.statRows} accessibilityLabel="Bed totals">
      <StatRow items={items} />
      {rent.length ? <StatRow items={rent} /> : null}
    </View>
  );
}
function StatRow({ items }: { items: Stat[] }) {
  return (
    <View style={styles.stats}>
      {items.map(({ key, value, label, Icon, tint, edge }) => (
        <View
          key={key}
          accessible
          accessibilityLabel={value + ' ' + label}
          style={[styles.card, styles.stat, tint ? { backgroundColor: tint } : null]}
        >
          <View style={styles.statTop}>
            <Icon size={18} color={edge ?? c.primary} />
            <Text className="font-heading" style={styles.statValue}>
              {value}
            </Text>
          </View>
          <Text
            className="font-body"
            numberOfLines={1}
            adjustsFontSizeToFit
            style={styles.statLabel}
          >
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}
export function BoardLegend({ finance }: { finance: boolean }) {
  const items: [BedTone, string][] = finance
    ? [
        ['paid', 'Paid'],
        ['due', 'Due'],
        ['overdue', 'Overdue'],
        ['proof', 'Proof sent'],
        ['reserved', 'Reserved'],
        ['vacant', 'Vacant'],
      ]
    : [
        ['occupied', 'Occupied'],
        ['reserved', 'Reserved'],
        ['vacant', 'Vacant'],
      ];
  return (
    <View style={[styles.card, styles.legend]} accessibilityLabel="Bed colour key">
      {items.map(([tone, label]) => (
        <View key={tone} style={styles.legendItem}>
          <View
            style={[
              styles.dot,
              { backgroundColor: fills[tone].fill, borderColor: fills[tone].edge },
            ]}
          />
          <Text className="font-body" numberOfLines={1} style={styles.legendText}>
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}
export function SectionBar(props: { Icon: LucideIcon; title: string; right?: ReactNode }) {
  return (
    <View style={styles.bar}>
      <props.Icon size={22} color={c.primary} />
      <Text className="font-heading" numberOfLines={1} style={styles.barTitle}>
        {props.title}
      </Text>
      {props.right}
    </View>
  );
}
const styles = StyleSheet.create({
  card: { ...mobileSurfaces.icyCard, borderWidth: 1, borderRadius: m.inputRadius + 4 },
  room: {
    padding: 12,
    gap: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  roomHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  roomName: { flexShrink: 1, color: c.heading, fontSize: 17, fontWeight: '700' },
  beds: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginLeft: 'auto' },
  circle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 2px 6px rgba(0,77,56,0.18)',
  },
  dashed: { borderStyle: 'dashed' },
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  badgeText: { fontSize: m.body + 1, fontWeight: '800' },
  circleText: { fontSize: 15, fontWeight: '800' },
  muted: { color: c.secondary, fontSize: m.body },
  // Beds on the first row, rent on the second; cards share each row equally.
  statRows: { gap: 6 },
  stats: { flexDirection: 'row', gap: 6 },
  stat: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    gap: 2,
  },
  statTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statValue: { color: c.heading, fontSize: 20, fontWeight: '800' },
  statLabel: { color: c.text, fontSize: 12 },
  legend: {
    marginTop: 4,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 10,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '30%' },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5 },
  legendText: { color: c.text, fontSize: m.body },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: mobileColors.aqua,
    borderRadius: m.inputRadius,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  barTitle: { flex: 1, color: c.heading, fontSize: 17, fontWeight: '700' },
});
