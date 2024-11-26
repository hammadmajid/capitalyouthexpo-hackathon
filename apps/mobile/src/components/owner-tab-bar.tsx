import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BarChart3,
  Building2,
  CalendarDays,
  LayoutDashboard,
  PanelsTopLeft,
  UserRound,
  type LucideIcon,
} from 'lucide-react-native';
import { mobileOwnerColors as c, ownerMetrics as m } from '@hsm/ui';
type Tab = { label: string; Icon: LucideIcon; onPress: () => void; active?: boolean };
// Owner bottom navigation. Every tab opens a real screen; account items live in the menu.
export function OwnerTabBar({ tabs, premium = false }: { tabs: Tab[]; premium?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bar,
        premium && styles.premiumBar,
        { paddingBottom: Math.max(insets.bottom, m.smallGap) },
      ]}
    >
      {tabs.map((tab) => (
        <Pressable
          key={tab.label}
          accessibilityRole="tab"
          accessibilityLabel={tab.label}
          accessibilityState={{ selected: Boolean(tab.active) }}
          onPress={tab.onPress}
          style={[styles.tab, premium && tab.active && styles.activeTab]}
        >
          <tab.Icon
            size={m.stepIcon}
            color={premium && tab.active ? c.onPrimary : tab.active ? c.primary : c.secondary}
          />
          <Text
            className="font-heading"
            style={{
              fontSize: 11,
              color: premium && tab.active ? c.onPrimary : tab.active ? c.primary : c.secondary,
            }}
          >
            {tab.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
export const ownerTabIcons = {
  dashboard: LayoutDashboard,
  properties: Building2,
  bookings: CalendarDays,
  finance: BarChart3,
  operations: PanelsTopLeft,
  account: UserRound,
};
const styles = StyleSheet.create({
  bar: {
    ...mobileSurfaces.navigation,
    flexDirection: 'row',
    backgroundColor: mobileSurfaces.navigation.backgroundColor,
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingTop: 6,
  },
  premiumBar: {
    ...mobileSurfaces.dashboardGlass,
    marginHorizontal: 8,
    marginBottom: 8,
    borderRadius: 28,
    paddingHorizontal: 8,
  },
  activeTab: { ...mobileSurfaces.emeraldGlass, borderRadius: 30 },
  tab: { flex: 1, minHeight: m.touch, alignItems: 'center', justifyContent: 'center', gap: 2 },
});
import { mobileSurfaces } from '@hsm/ui';
