import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Ban,
  BadgeCheck,
  CircleX,
  Clock,
  FilePen,
  PenLine,
  ScanSearch,
  type LucideIcon,
} from 'lucide-react-native';
import type { VerificationStatus } from '@hsm/contracts';
import { mobileColors as colors, mobileSurfaces, radii, spacing } from '@hsm/ui';
// ADM-007: one icon, label and tone per verification status across queue, dossier and history.
export const statusMeta: Record<
  VerificationStatus,
  { label: string; Icon: LucideIcon; tone: string }
> = {
  draft: { label: 'Draft', Icon: FilePen, tone: colors.secondary },
  submitted: { label: 'Submitted', Icon: Clock, tone: colors.primary },
  under_review: { label: 'In review', Icon: ScanSearch, tone: colors.accent },
  changes_requested: { label: 'Changes requested', Icon: PenLine, tone: colors.gold },
  approved: { label: 'Approved', Icon: BadgeCheck, tone: colors.success },
  rejected: { label: 'Rejected', Icon: CircleX, tone: colors.dangerText },
  suspended: { label: 'Suspended', Icon: Ban, tone: colors.dangerText },
};
export function StatusPill({ status }: { status: VerificationStatus }) {
  const { label, Icon, tone } = statusMeta[status];
  return (
    <View style={[styles.pill, { borderColor: tone }]} accessibilityLabel={'Status: ' + label}>
      <Icon size={14} color={tone} strokeWidth={2} />
      <Text className="font-heading text-sm" style={{ color: tone }}>
        {label}
      </Text>
    </View>
  );
}
// A fact is an icon and its value; the label is announced to screen readers only.
export function IconFact({
  Icon,
  label,
  value,
  action,
}: {
  Icon: LucideIcon;
  label: string;
  value: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.fact} accessible accessibilityLabel={label + ': ' + value}>
      <View style={styles.icon}>
        <Icon size={18} color={colors.primary} strokeWidth={1.75} />
      </View>
      <Text className="font-body text-body text-text" style={styles.grow}>
        {value}
      </Text>
      {action}
    </View>
  );
}
export function IconButton({
  Icon,
  label,
  onPress,
  tone = 'outline',
  disabled = false,
}: {
  Icon: LucideIcon;
  label: string;
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
      <Text className="font-heading text-body" style={{ color }}>
        {label}
      </Text>
    </Pressable>
  );
}
export function ChipRow<T extends string>({
  values,
  value,
  onChange,
  labels,
}: {
  values: readonly T[];
  value: T;
  onChange: (value: T) => void;
  labels: Record<T, string>;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chips}
      accessibilityRole="tablist"
    >
      {values.map((item) => (
        <Pressable
          key={item}
          accessibilityRole="tab"
          accessibilityState={{ selected: item === value }}
          onPress={() => onChange(item)}
          style={[styles.chip, item === value && styles.chipOn]}
        >
          <Text
            className="font-heading text-sm"
            style={{ color: item === value ? colors.surface : colors.primary }}
          >
            {labels[item]}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
export function karachiTime(instant: string) {
  return new Date(instant).toLocaleString('en-PK', {
    timeZone: 'Asia/Karachi',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.icy,
  },
  fact: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 36 },
  icon: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    backgroundColor: colors.aqua,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: { flex: 1 },
  button: {
    flex: 1,
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
  chips: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    ...mobileSurfaces.icyCard,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    minHeight: 36,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.deep, borderColor: colors.deep },
});
