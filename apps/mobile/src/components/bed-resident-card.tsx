import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, User } from 'lucide-react-native';
import { formatDate, type OccupancyRentStatus } from '@hsm/contracts';
const rentText: Record<OccupancyRentStatus, string> = {
  overdue: 'Rent overdue',
  due: 'Rent due',
  paid: 'Rent paid',
  clear: 'Nothing billed yet',
  proof_pending: 'Proof sent · waiting for review',
};
import { mobileColors, mobileOwnerColors as c, ownerMetrics as m, mobileSurfaces } from '@hsm/ui';
// BED-002: the current resident as one card that opens their Stay (agreement, rent, payments).
// BED-001 / CHG-048: "Paid" only from a receipt-backed paid invoice with nothing open;
// "clear" means nothing billed yet and is never shown as paid.
export function BedResidentCard(props: {
  name: string;
  since?: string | undefined;
  rentStatus?: OccupancyRentStatus | null | undefined;
  onOpen: () => void;
}) {
  const overdue = props.rentStatus === 'overdue';
  const rent = props.rentStatus ? rentText[props.rentStatus] : '';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Resident and rent details"
      onPress={props.onOpen}
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <View style={[styles.card, overdue && { borderColor: c.danger }]}>
        <View style={styles.badge}>
          <User size={28} color={c.primary} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text className="font-heading" style={styles.name}>
            {props.name}
          </Text>
          {props.since ? (
            <Text style={styles.detail}>Since {formatDate(props.since + 'T00:00:00.000Z')}</Text>
          ) : null}
          {rent ? (
            <Text style={[styles.detail, { color: overdue ? c.danger : c.secondary }]}>{rent}</Text>
          ) : null}
        </View>
        <ChevronRight size={28} color={c.primary} />
      </View>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  card: {
    ...mobileSurfaces.icyCard,
    borderWidth: 1,
    borderRadius: m.cardRadius,
    padding: m.gap,
    flexDirection: 'row',
    alignItems: 'center',
    gap: m.smallGap,
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mobileColors.aqua,
  },
  name: { color: c.heading, fontSize: m.title - 4, fontWeight: '700' },
  detail: { color: c.secondary, fontSize: m.body },
});
