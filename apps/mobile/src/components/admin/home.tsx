import { mobileSurfaces } from '@hsm/ui';
import { PullScrollView } from '../pull-refresh';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Building2, Users, UserRound } from 'lucide-react-native';
import { router } from 'expo-router';
import { mobileColors as colors, icons, radii, spacing } from '@hsm/ui';
import { useAdminModeNavigation } from './modes';
import { AdminWorkspace } from './workspace';
import { HomeOverview } from './home-overview';
import { PremiumSurface, premiumShadow } from './premium-surface';

export function AdminHome() {
  const { profile, openCustomer } = useAdminModeNavigation();
  const admin = profile?.capabilities.admin;
  if (!admin) return null;
  if (!admin.isRoot) return <AdminWorkspace />;
  return (
    <SafeAreaView style={styles.page}>
      <PremiumSurface />
      <PullScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.brand}>
            <Building2 color={colors.primary} size={icons.size} strokeWidth={icons.strokeWidth} />
            <View>
              <Text className="font-heading text-xl text-heading">HSM</Text>
              <Text className="font-heading text-xs text-secondary">ROOT CONSOLE</Text>
            </View>
          </View>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Admin management"
              style={styles.management}
              android_ripple={{ color: colors.aqua }}
              onPress={() => router.push('/admin/management')}
            >
              <Users color={colors.primary} size={icons.size} strokeWidth={icons.strokeWidth} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Customer account"
              accessibilityHint="Open Customer space or complete your Customer profile"
              style={styles.management}
              android_ripple={{ color: colors.aqua }}
              onPress={() => {
                void openCustomer();
              }}
            >
              <UserRound color={colors.primary} size={icons.size} strokeWidth={icons.strokeWidth} />
            </Pressable>
          </View>
        </View>
        <HomeOverview />
      </PullScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.xl, paddingBottom: spacing.page },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  management: {
    ...mobileSurfaces.icyCard,
    minWidth: spacing.touch,
    ...premiumShadow,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: spacing.touch,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: mobileSurfaces.icyCard.borderColor,
    backgroundColor: mobileSurfaces.icyCard.backgroundColor,
  },
});
