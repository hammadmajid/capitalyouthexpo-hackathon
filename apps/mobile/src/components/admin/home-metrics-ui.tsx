import { mobileSurfaces } from '@hsm/ui';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronRight, CircleDollarSign, ClipboardCheck } from 'lucide-react-native';
import { mobileColors as colors, icons, radii, spacing } from '@hsm/ui';
// HMA-017: income is never estimated; the strip states plainly that it is not tracked.
export function IncomeCard() {
  return (
    <View style={styles.income} accessible accessibilityLabel="Platform income. Not tracked.">
      <CircleDollarSign color={colors.aqua} size={icons.size} />
      <Text className="font-heading text-body text-surface" style={styles.grow}>
        Platform income
      </Text>
      <Text className="font-body text-sm text-aqua">Not tracked</Text>
    </View>
  );
}
// VER: hostel verification is the platform's first job, so it leads the dashboard.
export function VerificationCard({ pending }: { pending?: number | undefined }) {
  const label =
    pending === undefined
      ? 'Hostel verifications'
      : 'Hostel verifications: ' + pending + ' waiting';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => router.push('/admin/verifications')}
      style={styles.verify}
    >
      <View style={styles.verifyIcon}>
        <ClipboardCheck color={colors.surface} size={icons.size} />
      </View>
      <View style={styles.grow}>
        <Text className="font-heading text-body text-heading">Hostel verifications</Text>
        {pending === undefined ? null : (
          <Text className="font-body text-sm text-secondary">
            {pending ? pending + ' waiting' : 'All clear'}
          </Text>
        )}
      </View>
      {pending ? (
        <View style={styles.count}>
          <Text className="font-heading text-sm text-surface">{pending}</Text>
        </View>
      ) : null}
      <ChevronRight color={colors.primary} size={icons.size} />
    </Pressable>
  );
}
export const overviewStyles = StyleSheet.create({
  section: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  periods: { gap: spacing.sm },
  period: {
    ...mobileSurfaces.icyCard,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  selected: { backgroundColor: colors.deep, borderColor: colors.deep },
});
const styles = StyleSheet.create({
  income: {
    ...mobileSurfaces.emeraldGlass,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: spacing.touch + spacing.sm,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  grow: { flex: 1 },
  verify: {
    ...mobileSurfaces.icyCard,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    minHeight: spacing.touch + spacing.md,
    borderRadius: radii.card,
    borderWidth: 1,
  },
  verifyIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.dangerText,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
