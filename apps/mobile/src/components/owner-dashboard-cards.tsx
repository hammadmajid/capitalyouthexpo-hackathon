import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  BedDouble,
  BusFront,
  Coins,
  Info,
  ChevronRight,
  UsersRound,
  UserRound,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react-native';
import { mobileOwnerColors as c, mobileSurfaces, ownerMetrics as m } from '@hsm/ui';
import { PremiumSurface } from './visual-surfaces';
import { paisaText } from './owner-status';
import type { OwnerHomeData } from './use-owner-home';
type Dashboard = NonNullable<OwnerHomeData['dashboard']['data']>;
export function DashboardCollections({
  dashboard,
  open,
}: {
  dashboard: Dashboard;
  open: (tool: string) => void;
}) {
  const d = dashboard.totals.details;
  return (
    <View style={[styles.row, { alignItems: 'stretch' }]}>
      <Pressable
        style={[styles.card, styles.collected]}
        accessibilityRole="button"
        accessibilityLabel={'Collected Amount: ' + paisaText(dashboard.totals.rent.collectedPaisa)}
        onPress={() =>
          Alert.alert(
            'Dashboard amounts',
            'Collections and trend use invoice due months and approved receipt allocations; security is excluded. Part payments on combined invoices are split proportionally for this summary only. Staff Salary Due includes unpaid issued obligations and current full-month salary terms already due.',
          )
        }
      >
        <PremiumSurface dark />
        <Info size={13} color={c.onPrimary} style={{ position: 'absolute', right: 10, top: 10 }} />
        <View style={styles.row}>
          <Coins color={c.onPrimary} size={30} />
          <View style={{ flex: 1 }}>
            <Text className="font-heading" style={styles.whiteLabel}>
              Collected Amount
            </Text>
            <Text className="font-body" style={styles.whiteNote}>
              By invoice month
            </Text>
          </View>
        </View>
        <Text className="font-heading" numberOfLines={1} adjustsFontSizeToFit style={styles.total}>
          {paisaText(dashboard.totals.rent.collectedPaisa)}
        </Text>
      </Pressable>
      <View style={[styles.card, { flex: 0.85, padding: 12 }]}>
        <Category
          label="Rent"
          amount={d?.rentCollectedPaisa}
          Icon={BedDouble}
          onPress={() => open('inventory')}
        />
        <View style={styles.rule} />
        <Category
          label="Transport"
          amount={d?.transportCollectedPaisa}
          Icon={BusFront}
          onPress={() => open('transport')}
        />
        {d?.otherCollectedPaisa ? (
          <Text style={styles.note}>Other services {paisaText(d.otherCollectedPaisa)}</Text>
        ) : null}
      </View>
    </View>
  );
}
function Category({
  label,
  amount,
  Icon,
  onPress,
}: {
  label: string;
  amount: number | undefined;
  Icon: LucideIcon;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label + ' collection details'}
      onPress={onPress}
      style={styles.category}
    >
      <Icon color={c.primary} size={24} />
      <View style={{ flex: 1 }}>
        <Text className="font-heading" style={styles.label}>
          {label}
        </Text>
        <Text className="font-heading" numberOfLines={1} adjustsFontSizeToFit style={styles.amount}>
          {amount === undefined ? '—' : paisaText(amount)}
        </Text>
      </View>
      <ChevronRight color={c.heading} size={17} />
    </Pressable>
  );
}
export function DashboardOccupancy({ dashboard }: { dashboard: Dashboard }) {
  const beds = dashboard.totals.beds;
  const percent = beds.beds ? Math.round((beds.occupied / beds.beds) * 100) : 0;
  return (
    <View
      style={[styles.card, styles.occupancy]}
      accessible
      accessibilityLabel={`Bed Occupancy: ${beds.occupied} occupied, ${beds.available} available, ${percent}%`}
    >
      <PremiumSurface dark />
      <View style={styles.row}>
        <BedDouble size={28} color={c.onPrimary} />
        <Text className="font-heading" style={[styles.whiteLabel, { flex: 1, fontSize: 17 }]}>
          Bed Occupancy
        </Text>
        <View style={{ width: 72 }}>
          <Text numberOfLines={1} adjustsFontSizeToFit style={styles.occupancyLabel}>
            Occupied
          </Text>
          <Text className="font-heading" style={styles.count}>
            {beds.occupied}
          </Text>
        </View>
        <View style={{ width: 72 }}>
          <Text numberOfLines={1} adjustsFontSizeToFit style={styles.occupancyLabel}>
            Available
          </Text>
          <Text className="font-heading" style={styles.count}>
            {beds.available}
          </Text>
        </View>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${percent}%` }]} />
        <Text className="font-heading" style={styles.progressText}>
          {beds.beds ? percent + '%' : 'No beds yet'}
        </Text>
      </View>
    </View>
  );
}
export function DashboardDues({
  dashboard,
  open,
}: {
  dashboard: Dashboard;
  open: (tool: string) => void;
}) {
  const d = dashboard.totals.details;
  return (
    <View style={styles.row}>
      <Due
        label="Staff Salary Due"
        amount={d?.salaryDuePaisa}
        Icon={UsersRound}
        color={c.primarySoft + '70'}
        onPress={() => open('staff-due')}
        hint="Salaries due as of today"
      />
      <Due
        label="Due Amount"
        amount={dashboard.totals.rent.outstandingPaisa}
        Icon={UserRound}
        color={c.dueSurface + '88'}
        onPress={() => open('stays-due')}
      />
      <Due
        label="Overdue Amount"
        amount={d?.overduePaisa}
        Icon={TriangleAlert}
        color={c.dangerSoft + '88'}
        onPress={() => open('stays-overdue')}
      />
    </View>
  );
}
function Due({
  label,
  amount,
  Icon,
  color,
  onPress,
  hint,
}: {
  label: string;
  amount: number | undefined;
  Icon: LucideIcon;
  color: string;
  onPress: () => void;
  hint?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label + ': ' + (amount === undefined ? 'Unavailable' : paisaText(amount))}
      accessibilityHint={hint}
      onPress={onPress}
      style={[styles.card, styles.due, { backgroundColor: color }]}
    >
      <Icon size={22} color={label === 'Overdue Amount' ? c.danger : c.primary} />
      <Text className="font-heading" style={styles.smallLabel}>
        {label}
      </Text>
      <Text className="font-heading" numberOfLines={1} adjustsFontSizeToFit style={styles.amount}>
        {amount === undefined ? '—' : paisaText(amount)}
      </Text>
    </Pressable>
  );
}
export const dashboardCardStyles = StyleSheet.create({
  card: {
    ...mobileSurfaces.dashboardGlass,
    borderRadius: m.cardRadius,
    borderWidth: 1,
    borderColor: mobileSurfaces.dashboardGlass.borderColor,
    padding: 14,
    overflow: 'hidden',
    gap: 12,
  },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  label: { color: c.heading, fontSize: 13, fontWeight: '700' },
});
const styles = StyleSheet.create({
  ...dashboardCardStyles,
  card: { ...dashboardCardStyles.card, flex: 1 },
  collected: { minHeight: 118, backgroundColor: c.primary, justifyContent: 'space-between' },
  whiteLabel: { color: c.onPrimary, fontSize: 15, fontWeight: '700' },
  whiteNote: { color: c.onPrimary, fontSize: 10 },
  total: { color: c.onPrimary, fontSize: 27, fontWeight: '800' },
  amount: { color: c.heading, fontSize: 14, fontWeight: '800' },
  category: { flexDirection: 'row', gap: 8, alignItems: 'center', minHeight: 38 },
  rule: { height: 1, backgroundColor: c.border },
  note: { color: c.secondary, fontSize: 10 },
  occupancy: { flex: 0, minHeight: 132, padding: 18, backgroundColor: c.primary, gap: 18 },
  occupancyLabel: { color: c.onPrimary, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  count: { color: c.onPrimary, fontSize: 29, textAlign: 'center' },
  track: {
    height: 17,
    backgroundColor: c.primaryStrong,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: c.border,
  },
  fill: { position: 'absolute', height: '100%', backgroundColor: c.primarySoft, borderRadius: 20 },
  progressText: {
    textAlign: 'center',
    fontSize: 10,
    color: c.onPrimary,
    backgroundColor: c.primaryStrong,
    borderRadius: 10,
    alignSelf: 'flex-end',
    paddingHorizontal: 8,
  },
  due: { minHeight: 102, gap: 5, padding: 10, alignItems: 'flex-start' },
  smallLabel: { color: c.heading, fontSize: 11, fontWeight: '700' },
});
