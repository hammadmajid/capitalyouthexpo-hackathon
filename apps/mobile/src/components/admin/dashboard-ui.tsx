import { mobileSurfaces } from '@hsm/ui';
import { PullScrollView } from '../pull-refresh';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Building2, ShieldCheck } from 'lucide-react-native';
import { mobileColors as colors, icons, radii, spacing } from '@hsm/ui';
import { PremiumSurface } from './premium-surface';

export function DashboardPage({
  children,
  label = 'ADMIN WORKSPACE',
  showBrand = true,
}: {
  children: ReactNode;
  label?: string;
  showBrand?: boolean;
}) {
  return (
    <SafeAreaView style={styles.page}>
      <PremiumSurface />
      <PullScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {showBrand ? (
          <View style={styles.brand}>
            <View style={styles.brandIcon}>
              <Building2 color={colors.primary} size={icons.size} />
            </View>
            <Text className="font-heading text-xl text-heading">HSM</Text>
            <Text style={styles.brandLabel} className="font-heading">
              {label}
            </Text>
          </View>
        ) : null}
        {children}
      </PullScrollView>
    </SafeAreaView>
  );
}
export function DashboardHero({
  root,
  name,
  title = 'Admin dashboard',
}: {
  root: boolean;
  name: string;
  title?: string;
}) {
  return (
    <View style={styles.hero}>
      <View style={styles.heroTop}>
        <View style={styles.badge}>
          <ShieldCheck color={colors.surface} size={icons.size} strokeWidth={icons.strokeWidth} />
          <Text className="font-heading text-sm text-surface">
            {root ? 'Root Admin' : 'Normal Admin'}
          </Text>
        </View>
        <Text className="font-heading text-sm text-surface">● Active</Text>
      </View>
      <Text accessibilityRole="header" className="font-heading text-title text-surface">
        {title}
      </Text>
      <Text className="font-body text-body text-aqua">{name}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  // Tablets and wide screens keep a readable centred column.
  content: {
    padding: spacing.xl,
    gap: spacing.xl,
    paddingBottom: spacing.page,
    width: '100%',
    maxWidth: 960,
    alignSelf: 'center',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  brandIcon: { padding: spacing.sm, borderRadius: radii.sm, backgroundColor: colors.aqua },
  brandLabel: { marginLeft: 'auto', color: colors.secondary, fontSize: spacing.md },
  hero: {
    ...mobileSurfaces.solidCard,
    borderWidth: 1,
    borderColor: mobileSurfaces.icyCard.borderColor,
    backgroundColor: colors.deep,
    borderRadius: radii.large,
    padding: spacing.xxl,
    gap: spacing.md,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  badge: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
