import { useState } from 'react';
import { PullScrollView } from './pull-refresh';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Building2, ChevronRight, UserRound, type LucideIcon } from 'lucide-react-native';
import type { SelfProfile } from '@hsm/contracts';
import {
  mobileColors as c,
  mobileSurfaces,
  icons,
  radii,
  spacing as s,
  natureLoginMetrics as m,
  natureLoginColors,
} from '@hsm/ui';
import { rememberMode } from '../lib/owner-mode';
import { LoginBackdrop, LoginLandscape } from './login-artwork';

export function AccountModes({
  profile,
  onOptions,
}: {
  profile: SelfProfile;
  onOptions: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function open(mode: 'customer' | 'owner') {
    if (busy) return;
    if (!profile.user.emailVerified) {
      onOptions();
      return;
    }
    if (!profile.capabilities[mode]) {
      router.push(mode === 'customer' ? '/customer-profile' : '/owner-profile');
      return;
    }
    setBusy(true);
    try {
      await rememberMode(profile.user.id, mode);
      router.replace(mode === 'customer' ? '/marketplace' : '/owner');
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={styles.page}>
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={StyleSheet.absoluteFill}
      >
        <LoginBackdrop />
      </View>
      <SafeAreaView style={styles.safe}>
        <PullScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.body}>
            <Text accessibilityRole="header" style={styles.title}>
              Choose your mode
            </Text>
            <View style={styles.cards}>
              <ModeCard
                label="Customer Mode"
                Icon={UserRound}
                disabled={busy}
                onPress={() => {
                  void open('customer');
                }}
              />
              <ModeCard
                label="Owner Mode"
                Icon={Building2}
                disabled={busy}
                onPress={() => {
                  void open('owner');
                }}
              />
            </View>
          </View>
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.landscape}
          >
            <LoginLandscape />
          </View>
        </PullScrollView>
      </SafeAreaView>
    </View>
  );
}
function ModeCard({
  label,
  Icon,
  disabled,
  onPress,
}: {
  label: string;
  Icon: LucideIcon;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      android_ripple={{ color: c.aqua }}
      style={styles.card}
    >
      <View style={styles.icon}>
        <Icon
          accessible={false}
          size={s.section}
          color={c.primary}
          strokeWidth={icons.strokeWidth}
        />
      </View>
      <Text style={styles.label}>{label}</Text>
      <View pointerEvents="none" style={styles.arrow}>
        <ChevronRight accessible={false} size={icons.size} color={c.primary} />
      </View>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: natureLoginColors.background },
  safe: { flex: 1 },
  scroll: { flexGrow: 1 },
  body: {
    flexGrow: 1,
    justifyContent: 'center',
    width: '100%',
    maxWidth: m.maxWidth,
    alignSelf: 'center',
    paddingHorizontal: s.xxl,
    paddingTop: s.xxl,
    paddingBottom: s.section,
  },
  title: {
    color: c.heading,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: m.titleSize,
    lineHeight: s.page,
    textAlign: 'center',
    marginBottom: s.section,
  },
  cards: { gap: s.xl },
  card: {
    ...mobileSurfaces.icyCard,
    minHeight: m.inputHeight * 2 + s.md,
    padding: s.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: s.lg,
    borderRadius: m.cardRadius,
    borderWidth: 1,
  },
  icon: {
    width: s.touch + s.sm,
    height: s.touch + s.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.icy,
  },
  label: {
    flex: 1,
    flexShrink: 1,
    marginRight: s.xl,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: s.xl,
    color: c.heading,
    textAlign: 'left',
  },
  arrow: { position: 'absolute', right: s.xl, top: 0, bottom: 0, justifyContent: 'center' },
  landscape: { height: m.landscapeHeight, flexShrink: 0 },
});
