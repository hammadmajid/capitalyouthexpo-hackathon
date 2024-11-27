import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { mobileColors as colors, icons, mobileSurfaces, radii, spacing } from '@hsm/ui';
import { premiumShadow } from './premium-surface';
// Action tiles are smaller: phone 3, tablet 4, wide 6.
function useTileColumns() {
  const { width } = useWindowDimensions();
  return width >= 900 ? 6 : width >= 600 ? 4 : 3;
}
function rows<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, i * size + size),
  );
}
export type GridAction = {
  label: string;
  icon: LucideIcon;
  onPress: () => void;
  badge?: number | undefined;
};
// One-tap destinations as icon tiles; a badge shows pending work where known.
export function ActionGrid({ actions }: { actions: GridAction[] }) {
  const columns = useTileColumns();
  return (
    <View style={styles.grid}>
      {rows(actions, columns).map((row, index) => (
        <View key={index} style={styles.row}>
          {row.map(({ label, icon: Icon, onPress, badge }) => (
            <Pressable
              key={label}
              accessibilityRole="button"
              accessibilityLabel={badge ? label + ', ' + badge + ' pending' : label}
              onPress={onPress}
              android_ripple={{ color: colors.aqua }}
              style={styles.tile}
            >
              <View style={styles.icon}>
                <Icon color={colors.primary} size={icons.size} strokeWidth={icons.strokeWidth} />
                {badge ? (
                  <View style={styles.badge}>
                    <Text className="font-heading text-xs text-surface">{badge}</Text>
                  </View>
                ) : null}
              </View>
              <Text
                className="font-heading text-xs text-heading"
                numberOfLines={2}
                style={styles.center}
              >
                {label}
              </Text>
            </Pressable>
          ))}
          {Array.from({ length: columns - row.length }, (_, i) => (
            <View key={'gap' + i} style={styles.spacer} />
          ))}
        </View>
      ))}
    </View>
  );
}
export type GridStat = {
  label: string;
  value: number | string | undefined;
  icon: LucideIcon;
  onPress?: (() => void) | undefined;
  a11y?: string;
};
// Same tile look as ActionGrid, with the number under the icon.
export function StatGrid({ stats }: { stats: GridStat[] }) {
  const columns = useTileColumns();
  return (
    <View style={styles.grid}>
      {rows(stats, columns).map((row, index) => (
        <View key={index} style={styles.row}>
          {row.map(({ label, value, icon: Icon, onPress, a11y }) => (
            <Pressable
              key={label}
              accessible
              accessibilityRole={onPress ? 'button' : undefined}
              accessibilityLabel={a11y ?? String(value ?? 'Unavailable') + ' ' + label}
              disabled={!onPress}
              onPress={onPress}
              android_ripple={{ color: colors.aqua }}
              style={styles.tile}
            >
              <View style={styles.icon}>
                <Icon color={colors.primary} size={icons.size} strokeWidth={icons.strokeWidth} />
              </View>
              <Text className="font-heading text-subtitle text-heading">
                {typeof value === 'number' ? value.toLocaleString('en-PK') : (value ?? '—')}
              </Text>
              <Text
                className="font-heading text-xs text-secondary"
                numberOfLines={2}
                style={styles.center}
              >
                {label}
              </Text>
            </Pressable>
          ))}
          {Array.from({ length: columns - row.length }, (_, i) => (
            <View key={'gap' + i} style={styles.spacer} />
          ))}
        </View>
      ))}
    </View>
  );
}
const card = {
  ...mobileSurfaces.icyCard,
  ...premiumShadow,
  flex: 1,
  borderWidth: 1,
  borderRadius: radii.card,
  padding: spacing.lg,
  gap: spacing.sm,
} as const;
const styles = StyleSheet.create({
  grid: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  spacer: { flex: 1 },
  tile: {
    ...card,
    padding: spacing.md,
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { textAlign: 'center' },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: colors.aqua,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 20,
    height: 20,
    borderRadius: radii.pill,
    backgroundColor: colors.dangerText,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
});
