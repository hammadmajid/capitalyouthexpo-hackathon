import { useId, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, Crown, UserRound, type LucideIcon } from 'lucide-react-native';
import { mobileOwnerColors as c, mobileSurfaces, ownerMetrics as m } from '@hsm/ui';
import Svg, { Defs, LinearGradient, RadialGradient, Stop, Rect, Ellipse } from 'react-native-svg';

export type OwnerAccountItem = {
  label: string;
  short?: string;
  detail?: string | undefined;
  Icon: LucideIcon;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
};

function Glass({ children }: { children: ReactNode }) {
  const id = useId().replaceAll(':', '');
  return (
    <View style={s.card}>
      <View pointerEvents="none" style={s.light}>
        <Svg width="100%" height="100%" viewBox="0 0 500 300" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0" stopColor={c.surface} stopOpacity="0.88" />
              <Stop offset="0.5" stopColor={c.surface} stopOpacity="0.58" />
              <Stop offset="1" stopColor={c.primarySoft} stopOpacity="0.8" />
            </LinearGradient>
            <RadialGradient id={id + 'corner'}>
              <Stop offset="0" stopColor={c.primary} stopOpacity="0.14" />
              <Stop offset="1" stopColor={c.primary} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect width="500" height="300" fill={'url(#' + id + ')'} />
          <Ellipse cx="490" cy="300" rx="270" ry="220" fill={'url(#' + id + 'corner)'} />
          <Ellipse cx="0" cy="0" rx="170" ry="130" fill={'url(#' + id + 'corner)'} />
        </Svg>
      </View>
      {children}
    </View>
  );
}

export function OwnerAccountProfile(props: {
  name: string;
  email: string | null;
  onPress: () => void;
}) {
  return (
    <Glass>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open Owner profile"
        onPress={props.onPress}
        style={s.profile}
      >
        <View style={s.avatar}>
          <UserRound size={m.stepIcon + 6} color={c.primary} />
        </View>
        <View style={s.grow}>
          <View style={s.nameRow}>
            <Text className="font-heading" style={s.name}>
              {props.name || 'Owner'}
            </Text>
            <View style={s.role}>
              <Crown size={14} color={c.primary} />
              <Text className="font-heading" style={s.roleText}>
                Owner
              </Text>
            </View>
          </View>
          {props.email ? <Text style={s.email}>{props.email}</Text> : null}
        </View>
        <ChevronRight size={m.stepIcon} color={c.secondary} />
      </Pressable>
    </Glass>
  );
}

export function OwnerAccountGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={s.group}>
      {title ? (
        <Text accessibilityRole="header" className="font-heading" style={s.title}>
          {title}
        </Text>
      ) : null}
      <Glass>{children}</Glass>
    </View>
  );
}

export function OwnerAccountRows({ items }: { items: OwnerAccountItem[] }) {
  return (
    <>
      {items.map((item, index) => (
        <Pressable
          key={item.label}
          accessibilityRole="button"
          accessibilityLabel={item.label + (item.detail ? '. ' + item.detail : '')}
          accessibilityState={{ disabled: item.disabled ?? false }}
          disabled={item.disabled}
          onPress={item.onPress}
          style={[s.row, item.disabled && { opacity: 0.5 }]}
        >
          <View style={s.icon}>
            <item.Icon size={m.stepIcon} color={item.danger ? c.danger : c.primary} />
          </View>
          <View style={[s.rowBody, index > 0 && s.divider]}>
            <View style={s.grow}>
              <Text className="font-heading" style={[s.label, item.danger && { color: c.danger }]}>
                {item.short ?? item.label}
              </Text>
            </View>
            <ChevronRight size={m.stepIcon} color={c.secondary} />
          </View>
        </Pressable>
      ))}
    </>
  );
}

const s = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  card: {
    ...mobileSurfaces.glassEdge,
    backgroundColor: c.surface + '70',
    borderRadius: m.cardRadius,
    borderWidth: 1,
    borderColor: c.surface,
    paddingHorizontal: m.gap,
    overflow: 'hidden',
  },
  light: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: m.cardRadius,
    overflow: 'hidden',
  },
  group: { gap: m.smallGap },
  title: { color: c.heading, fontSize: m.title - 2, paddingTop: m.smallGap },
  profile: { flexDirection: 'row', gap: m.gap, alignItems: 'center', paddingVertical: m.gap + 4 },
  avatar: {
    width: m.touch + 4,
    height: m.touch + 4,
    borderRadius: m.inputRadius,
    backgroundColor: c.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: m.smallGap },
  name: { color: c.heading, fontSize: m.title, flexShrink: 1 },
  role: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: m.touch,
    backgroundColor: c.primarySoft,
  },
  roleText: { color: c.primary, fontSize: m.small },
  email: { color: c.secondary, fontSize: m.small, marginTop: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: m.gap, minHeight: m.touch + 10 },
  icon: {
    width: m.touch - 6,
    height: m.touch - 6,
    borderRadius: m.touch,
    backgroundColor: c.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: m.smallGap,
    paddingVertical: m.smallGap,
  },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
  label: { color: c.heading, fontSize: m.body, flexShrink: 1 },
});
