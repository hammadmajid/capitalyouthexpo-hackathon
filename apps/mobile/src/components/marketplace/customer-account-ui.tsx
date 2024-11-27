import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { router } from 'expo-router';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { mobileColors as c, mobileSurfaces, marketplaceMetrics as m } from '@hsm/ui';

type Row = { label: string; Icon: LucideIcon; onPress: () => void; detail?: string };

export function openCustomerProfile() {
  router.push({ pathname: '/customer-profile', params: { from: 'account' } });
}

export function AccountGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={accountStyles.group}>
      {title ? (
        <Text accessibilityRole="header" className="font-heading" style={accountStyles.label}>
          {title}
        </Text>
      ) : null}
      <View style={accountStyles.panel}>{children}</View>
    </View>
  );
}

export function AccountProfileShortcut({
  title = 'HSM Customer',
  subtitle,
}: { title?: string; subtitle?: string } = {}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={openCustomerProfile}
      android_ripple={{ color: c.aqua }}
      style={[accountStyles.panel, accountStyles.profile]}
    >
      <View style={[accountStyles.avatar, accountStyles.profileBadge]}>
        <Text className="font-heading" style={accountStyles.badgeLabel}>
          HSM
        </Text>
      </View>
      <View style={accountStyles.grow}>
        <Text className="font-heading" style={accountStyles.profileLabel}>
          {title}
        </Text>
        {subtitle ? <Text style={accountStyles.subtitle}>{subtitle}</Text> : null}
      </View>
      <ChevronRight size={m.iconSize - 4} color={c.secondary} accessible={false} />
    </Pressable>
  );
}

export function AccountRows({ rows }: { rows: Row[] }) {
  return (
    <>
      {rows.map(({ label, Icon, onPress, detail }, index) => (
        <Pressable
          key={label}
          accessibilityRole="button"
          android_ripple={{ color: c.aqua }}
          onPress={onPress}
          style={accountStyles.menuRow}
        >
          <View style={accountStyles.iconTile}>
            <Icon size={m.iconSize - 3} color={c.primary} accessible={false} />
          </View>
          <View style={[accountStyles.rowContent, index > 0 && accountStyles.divider]}>
            <View style={accountStyles.grow}>
              <Text className="font-heading" style={accountStyles.label}>
                {label}
              </Text>
              {detail ? <Text style={accountStyles.secondary}>{detail}</Text> : null}
            </View>
            <ChevronRight size={m.iconSize - 4} color={c.secondary} accessible={false} />
          </View>
        </Pressable>
      ))}
    </>
  );
}

export const accountStyles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: m.contentMaxWidth,
    alignSelf: 'center',
    padding: m.lg,
    gap: m.lg,
  },
  grow: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: m.md,
    minHeight: 52,
    paddingVertical: m.sm,
  },
  header: { paddingHorizontal: m.xs, marginTop: m.sm, marginBottom: m.xs },
  group: { gap: m.sm },
  panel: {
    ...mobileSurfaces.glassEdge,
    backgroundColor: `${c.icy}90`,
    borderColor: mobileSurfaces.icyCard.borderColor,
    borderWidth: 1,
    borderRadius: m.large,
    paddingHorizontal: m.md,
    paddingVertical: m.xs,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: m.md,
    minHeight: Math.round(m.touch * 1.44),
  },
  rowContent: {
    flex: 1,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: m.sm,
    paddingVertical: m.sm,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
  },
  iconTile: {
    width: Math.round((m.section + m.xs) * 1.44),
    height: Math.round(m.section * 1.44),
    borderRadius: m.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.aqua,
  },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: m.lg,
    paddingVertical: m.md,
    overflow: 'hidden',
  },
  profileBadge: { backgroundColor: c.deep },
  badgeLabel: { color: c.surface, fontSize: m.bodySize },
  profileLabel: { color: c.heading, fontSize: 18 },
  avatar: {
    ...mobileSurfaces.icyCard,
    borderWidth: 1,
    width: 56,
    height: 56,
    borderRadius: m.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  name: { color: c.heading, fontSize: 22 },
  label: { color: c.heading, fontSize: m.bodySize },
  secondary: { color: c.secondary, fontSize: 13 },
  link: { color: c.primary, fontSize: m.bodySize },
  feedback: { color: c.dangerText },
  subtitle: { color: c.secondary, fontSize: 13 },
});
