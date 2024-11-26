import { mobileSurfaces } from '@hsm/ui';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Bell, Building2, ChevronRight, type LucideIcon } from 'lucide-react-native';
import { mobileOwnerColors as c, ownerMetrics as m } from '@hsm/ui';
import { SetupText } from './owner-wizard-ui';
// Owner dashboard primitives: one design language with the setup wizard, Android-first sizes.
export function OwnerHero({
  name,
  title,
  onMenu,
  onNotifications,
  back,
  unread = 0,
}: {
  unread?: number;
  name: string;
  title: string;
  onMenu?: (() => void) | undefined;
  onNotifications?: (() => void) | undefined;
  back?: ReactNode;
}) {
  return (
    <View style={styles.hero}>
      <View style={styles.heroTop}>
        <Building2 size={m.stepIcon + 4} color={c.onHero} />
        <View style={styles.grow}>
          <Text className="font-heading" style={styles.brand}>
            HSM
          </Text>
          <Text className="font-body" style={styles.heroMuted}>
            Hostel Marketplace & Management
          </Text>
        </View>
        {onNotifications ? (
          <HeroButton
            label={unread ? 'Notifications, ' + unread + ' unread' : 'Notifications'}
            Icon={Bell}
            onPress={onNotifications}
            badge={unread}
          />
        ) : null}
        {onMenu ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open Owner account"
            onPress={onMenu}
            style={[styles.heroButton, styles.avatar]}
          >
            <Text className="font-heading" style={{ color: c.onPrimary, fontSize: m.title - 2 }}>
              {name.trim().charAt(0).toUpperCase() || 'O'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {back}
      <View style={styles.heroChip}>
        <Text className="font-heading" style={{ color: c.onHero, fontSize: m.small }}>
          {title}
        </Text>
      </View>
    </View>
  );
}
function HeroButton({
  label,
  Icon,
  onPress,
  badge = 0,
}: {
  label: string;
  Icon: LucideIcon;
  onPress: () => void;
  badge?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.heroButton}
    >
      <Icon size={m.stepIcon} color={c.onHero} />
      {badge ? (
        <View style={styles.badge}>
          <Text className="font-heading" style={{ color: c.onPrimary, fontSize: 11 }}>
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
export function MetricTile({
  label,
  value,
  note,
  Icon,
}: {
  label: string;
  value: string;
  note?: string | undefined;
  Icon: LucideIcon;
}) {
  return (
    <View
      style={styles.metric}
      accessible
      accessibilityLabel={label + ': ' + value + (note ? ', ' + note : '')}
    >
      <View style={styles.metricIcon}>
        <Icon size={m.stepIcon} color={c.primary} />
      </View>
      <Text
        className="font-heading"
        style={styles.metricValue}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      <Text className="font-heading" style={styles.metricLabel} numberOfLines={2}>
        {label}
      </Text>
      {note ? (
        <Text className="font-body" style={styles.metricNote} numberOfLines={2}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}
export function QuickAction({
  label,
  description,
  Icon,
  onPress,
  disabled = false,
  glass = false,
}: {
  label: string;
  description?: string;
  Icon: LucideIcon;
  onPress: () => void;
  disabled?: boolean;
  glass?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={description ? label + '. ' + description : label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.quick, glass && mobileSurfaces.dashboardGlass, disabled && { opacity: 0.5 }]}
    >
      <View style={styles.metricIcon}>
        <Icon size={m.stepIcon} color={c.primary} />
      </View>
      <Text className="font-heading" style={styles.quickLabel} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}
export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text accessibilityRole="header" className="font-heading" style={styles.section}>
        {children}
      </Text>
      {action}
    </View>
  );
}
export const ownerGrid = { flexDirection: 'row', flexWrap: 'wrap', gap: m.smallGap + 4 } as const;
const styles = StyleSheet.create({
  hero: {
    ...mobileSurfaces.glassEdge,
    borderWidth: 1,
    borderColor: mobileSurfaces.icyCard.borderColor,
    backgroundColor: c.hero,
    borderRadius: m.cardRadius,
    padding: m.cardPadding,
    gap: m.smallGap,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: m.gap, marginBottom: m.smallGap },
  grow: { flex: 1 },
  brand: { color: c.onHero, fontSize: m.title },
  heroMuted: { color: c.heroMuted, fontSize: m.small },
  heroButton: {
    width: m.touch,
    height: m.touch,
    borderRadius: m.touch,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  avatar: { backgroundColor: c.primary },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: c.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: m.cardRadius,
    paddingHorizontal: m.gap,
    paddingVertical: 6,
  },
  // Metric and quick-action tiles share one centred tile: icon, value/label, optional note.
  metric: {
    ...mobileSurfaces.icyCard,
    flexGrow: 1,
    flexBasis: '30%',
    alignItems: 'center',
    backgroundColor: mobileSurfaces.icyCard.backgroundColor,
    borderRadius: m.cardRadius,
    borderWidth: 1,
    borderColor: mobileSurfaces.icyCard.borderColor,
    padding: m.gap - 4,
    gap: 4,
  },
  metricIcon: {
    width: m.touch - 8,
    height: m.touch - 8,
    borderRadius: m.touch,
    backgroundColor: c.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: { color: c.heading, fontSize: m.title },
  metricLabel: { color: c.secondary, fontSize: m.small + 1, textAlign: 'center' },
  metricNote: { color: c.secondary, fontSize: m.small - 1, textAlign: 'center' },
  quick: {
    ...mobileSurfaces.icyCard,
    flexGrow: 1,
    flexBasis: '30%',
    minHeight: m.touch * 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mobileSurfaces.icyCard.backgroundColor,
    borderRadius: m.cardRadius,
    borderWidth: 1,
    borderColor: mobileSurfaces.icyCard.borderColor,
    padding: m.gap - 4,
    gap: 6,
  },
  quickLabel: { color: c.heading, fontSize: m.small + 1, textAlign: 'center' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  section: { color: c.heading, fontSize: m.title },
});
export function DrillTile({
  title,
  detail,
  status,
  onPress,
}: {
  title: string;
  detail: string;
  status?: ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title + '. ' + detail}
      onPress={onPress}
      style={drill.tile}
    >
      <View style={drill.grow}>
        <Text className="font-heading" style={drill.title}>
          {title}
        </Text>
        <SetupText muted>{detail}</SetupText>
        {status}
      </View>
      <ChevronRight size={m.stepIcon} color={c.primary} />
    </Pressable>
  );
}
const drill = StyleSheet.create({
  tile: {
    ...mobileSurfaces.icyCard,
    minHeight: m.touch + 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: m.gap,
    borderWidth: 1,
    borderColor: mobileSurfaces.icyCard.borderColor,
    borderRadius: m.inputRadius,
    padding: m.gap - 4,
    backgroundColor: mobileSurfaces.icyCard.backgroundColor,
  },
  grow: { flex: 1, gap: 4 },
  title: { color: c.heading, fontSize: m.body + 1 },
});
