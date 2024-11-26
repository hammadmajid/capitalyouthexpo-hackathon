import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  CalendarDays,
  ReceiptText,
  LogOut,
  MessageCircle,
  BusFront,
  Megaphone,
} from 'lucide-react-native';
import { mobileOwnerColors as c } from '@hsm/ui';
import { dashboardCardStyles as s } from './owner-dashboard-cards';
import type { OwnerHomeData } from './use-owner-home';
type Dashboard = NonNullable<OwnerHomeData['dashboard']['data']>;
export function OwnerAttentionPanel({ dashboard }: { dashboard: Dashboard }) {
  const a = dashboard.totals.actions,
    d = dashboard.totals.details;
  const groups = [
    { label: 'Bookings', count: a.pendingBookings, Icon: CalendarDays, tool: 'bookings' },
    { label: 'Payment Proofs', count: a.pendingProofs, Icon: ReceiptText, tool: 'inventory' },
    {
      label: 'Transport Requests',
      count: d?.transportRequests,
      Icon: BusFront,
      tool: 'transport-requests',
    },
    { label: 'Upcoming Checkouts', count: a.upcomingCheckouts, Icon: LogOut, tool: 'stays' },
    { label: 'Messages', count: d?.unreadMessages, Icon: MessageCircle, tool: 'chat' },
    { label: 'Complaints', count: a.openComplaints, Icon: Megaphone, tool: 'services' },
  ];
  return (
    <View style={styles.grid}>
      {groups.map(({ label, count, Icon, tool }) => (
        <Pressable
          key={label}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${count ?? 'Unavailable'}`}
          onPress={() =>
            router.push({
              pathname: '/owner-branch',
              params: {
                ...(dashboard.branches.length === 1
                  ? { branchId: dashboard.branches[0]?.branchId }
                  : {}),
                tool,
              },
            })
          }
          style={[s.card, styles.tile]}
        >
          <Icon color={c.primary} size={27} />
          <View style={{ flex: 1 }}>
            <Text className="font-heading" style={styles.label}>
              {label}
            </Text>
            <Text className="font-heading" style={styles.count}>
              {count ?? '—'}
            </Text>
          </View>
          {(label === 'Messages' || label === 'Complaints') && Boolean(count) ? (
            <View style={styles.dot} />
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  tile: {
    flexBasis: '30%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 91,
    padding: 11,
    gap: 8,
  },
  label: { color: c.heading, fontSize: 12, fontWeight: '700' },
  count: { color: c.heading, fontSize: 21, fontWeight: '800' },
  dot: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: c.primary,
  },
});
