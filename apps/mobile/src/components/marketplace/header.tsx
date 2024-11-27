import { Text, View } from 'react-native';
import { Bell, SlidersHorizontal, UserRound } from 'lucide-react-native';
import { mobileMarketplaceColors as colors, marketplaceMetrics as metrics } from '@hsm/ui';
import { AppHeader, NavIconButton, type HeaderSearchConfig } from '../navigation/header';
export function MarketplaceHeader({
  title = 'HSM',
  name,
  unreadCount,
  openProfile,
  openNotifications,
  search,
  filters,
}: {
  title?: string;
  name: string | null;
  unreadCount: number;
  openProfile: () => void;
  openNotifications: () => void;
  search?: HeaderSearchConfig;
  filters?: () => void;
}) {
  return (
    <View
      style={{
        paddingHorizontal: metrics.lg,
        paddingVertical: metrics.sm,
        width: '100%',
        maxWidth: 1240,
        alignSelf: 'center',
      }}
    >
      <AppHeader
        title={title}
        showBack={false}
        {...(search ? { search } : {})}
        actions={
          <View style={{ flexDirection: 'row', gap: metrics.sm }}>
            {filters ? (
              <NavIconButton label="Search filters" onPress={filters}>
                <SlidersHorizontal color={colors.primary} size={metrics.iconSize} />
              </NavIconButton>
            ) : null}
            <NavIconButton
              label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
              onPress={openNotifications}
            >
              <Bell color={colors.primary} size={metrics.iconSize} />
              {unreadCount > 0 ? (
                <Text style={{ color: colors.error, position: 'absolute', top: 0, right: 0 }}>
                  {unreadCount}
                </Text>
              ) : null}
            </NavIconButton>
            <NavIconButton label="Profile" onPress={openProfile}>
              {name ? (
                <Text style={{ color: colors.dark, fontFamily: 'PlusJakartaSans_700Bold' }}>
                  {name.trim().slice(0, 1).toUpperCase()}
                </Text>
              ) : (
                <UserRound color={colors.primary} size={metrics.iconSize} />
              )}
            </NavIconButton>
          </View>
        }
      />
    </View>
  );
}
