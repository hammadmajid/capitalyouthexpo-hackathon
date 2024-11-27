import { Pressable, StyleSheet, Text, View } from 'react-native';
import { mobileColors, mobileSurfaces } from '@hsm/ui';
import { Home, MapPin, Heart, CalendarDays, UserRound } from 'lucide-react-native';
import { mobileMarketplaceColors as colors, marketplaceMetrics as metrics } from '@hsm/ui';
export const marketplaceTabs = ['Home', 'Map', 'Saved', 'Bookings', 'Profile'] as const;
export type MarketplaceTab = (typeof marketplaceTabs)[number];
const tabIcons = { Home, Map: MapPin, Saved: Heart, Bookings: CalendarDays, Profile: UserRound };
export function MarketplaceNavigation({
  selected,
  select,
}: {
  selected: MarketplaceTab;
  select: (tab: MarketplaceTab) => void;
}) {
  const account = selected === 'Profile';
  return (
    <View
      accessibilityRole="tablist"
      style={[
        {
          ...mobileSurfaces.navigation,
          flexDirection: 'row',
          backgroundColor: mobileSurfaces.navigation.backgroundColor,
          minHeight: metrics.navigationHeight,
          width: '100%',
          maxWidth: 840,
          alignSelf: 'center',
          borderTopWidth: 1,
          borderTopColor: colors.border,
        },
        account && styles.accountBar,
      ]}
    >
      {marketplaceTabs.map((tab) => {
        const Icon = tabIcons[tab];
        const active = selected === tab;
        return (
          <Pressable
            key={tab}
            accessibilityRole="tab"
            accessibilityLabel={tab === 'Profile' ? 'Account' : tab}
            accessibilityState={{ selected: active }}
            onPress={() => select(tab)}
            style={[
              {
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                gap: metrics.xs,
                minHeight: metrics.touch,
              },
              account && active && styles.accountTab,
            ]}
          >
            <Icon
              size={metrics.iconSize}
              strokeWidth={metrics.iconStroke}
              color={active ? colors.primary : colors.secondary}
            />
            <Text
              style={{
                color: active ? colors.primary : colors.secondary,
                fontFamily: active ? 'PlusJakartaSans_700Bold' : 'PlusJakartaSans_400Regular',
              }}
            >
              {tab === 'Profile' ? 'Account' : tab}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  accountBar: {
    ...mobileSurfaces.glassEdge,
    width: '97%',
    minHeight: metrics.navigationHeight - metrics.xs,
    marginBottom: metrics.xs,
    padding: metrics.xs,
    borderRadius: metrics.large,
    borderWidth: 1,
    borderColor: mobileColors.surface,
  },
  accountTab: {
    backgroundColor: mobileColors.aqua,
    borderRadius: metrics.input,
    borderWidth: 1,
    borderColor: mobileColors.surface,
  },
});
