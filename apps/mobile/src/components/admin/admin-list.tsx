import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { mobileColors as colors, icons, mobileSurfaces, radii, spacing } from '@hsm/ui';
import { premiumShadow } from './premium-surface';
import { StatusBadge } from './management-ui';
// One tappable record row used by every admin queue and directory.
export function RecordRow({
  icon: Icon,
  title,
  subtitle,
  body,
  status,
  label,
  onPress,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string | undefined;
  body?: string | null | undefined;
  status?: string | undefined;
  label: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label}
      disabled={!onPress}
      onPress={onPress}
      android_ripple={{ color: colors.aqua }}
      style={styles.row}
    >
      <View style={styles.icon}>
        <Icon size={20} color={colors.primary} strokeWidth={icons.strokeWidth} />
      </View>
      <View style={styles.grow}>
        <Text className="font-heading text-body text-heading" numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text className="font-body text-sm text-secondary" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
        {body ? (
          <Text className="font-body text-sm text-text" numberOfLines={3}>
            {body}
          </Text>
        ) : null}
        {status ? <StatusBadge value={status} /> : null}
      </View>
      {onPress ? <ChevronRight size={20} color={colors.primary} /> : null}
    </Pressable>
  );
}
// A compact icon + value line inside detail cards.
export function Fact({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <View style={styles.fact}>
      <Icon size={16} color={colors.secondary} strokeWidth={icons.strokeWidth} />
      <Text className="font-body text-sm text-text" style={styles.grow}>
        {children}
      </Text>
    </View>
  );
}
// Short visible text with a full accessibility label; tone marks primary or destructive actions.
export function ActionButton({
  icon: Icon,
  text,
  label = text,
  onPress,
  tone = 'outline',
  disabled = false,
}: {
  icon: LucideIcon;
  text: string;
  label?: string;
  onPress: () => void;
  tone?: 'solid' | 'outline' | 'danger';
  disabled?: boolean;
}) {
  const color =
    tone === 'solid' ? colors.surface : tone === 'danger' ? colors.dangerText : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      android_ripple={{ color: colors.aqua }}
      style={[
        styles.button,
        tone === 'solid' ? mobileSurfaces.emeraldGlass : mobileSurfaces.input,
        tone === 'danger' && { borderColor: colors.dangerText },
        disabled && styles.disabled,
      ]}
    >
      <Icon size={18} color={color} strokeWidth={2} />
      <Text className="font-heading text-body" style={{ color }} numberOfLines={1}>
        {text}
      </Text>
    </Pressable>
  );
}
export function ButtonRow({ children }: { children: ReactNode }) {
  return <View style={styles.buttons}>{children}</View>;
}
export function shortId(id: string | null | undefined) {
  return id ? id.slice(0, 8) : 'System';
}
export function pkTime(instant: string) {
  return new Date(instant).toLocaleString('en-PK', {
    timeZone: 'Asia/Karachi',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
const styles = StyleSheet.create({
  row: {
    ...mobileSurfaces.icyCard,
    ...premiumShadow,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.card,
    borderWidth: 1,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: colors.aqua,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: { flex: 1, gap: spacing.xs },
  fact: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  buttons: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  button: {
    flexGrow: 1,
    flexBasis: 120,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: spacing.touch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.input,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
  },
  disabled: { opacity: 0.5 },
});
