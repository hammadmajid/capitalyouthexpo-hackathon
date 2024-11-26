import type { ReactNode } from 'react';
import { router } from 'expo-router';
import { House } from 'lucide-react-native';
import { icons, mobileSurfaces, natureLoginColors as c, natureLoginMetrics as m } from '@hsm/ui';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoginBackdrop, LoginGlass, LoginLandscape, LoginLogo } from './login-artwork';
import { AuthBack, AuthIntro, AuthPrivacy } from './auth-screen-details';

export function LoginLink({
  label,
  onPress,
  underline = false,
}: {
  label: string;
  onPress: () => void;
  underline?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      android_ripple={{ color: c.divider }}
      style={styles.link}
    >
      <Text style={[styles.linkText, underline && styles.underline]}>{label}</Text>
    </Pressable>
  );
}
function LoginOptions() {
  return (
    <View>
      <View style={styles.divider}>
        <View style={styles.rule} />
        <Text style={styles.dividerText}>OR EXPLORE</Text>
        <View style={styles.rule} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Continue as guest"
        onPress={() => router.push('/guest')}
        android_ripple={{ color: c.divider }}
        style={styles.guest}
      >
        <View style={styles.guestContent}>
          <House
            accessible={false}
            size={m.iconSize}
            color={c.heading}
            strokeWidth={icons.strokeWidth}
          />
          <Text style={styles.guestText}>Continue as guest</Text>
        </View>
      </Pressable>
      <LoginLink
        label="Activate manager account"
        underline
        onPress={() => router.push('/auth/activate')}
      />
    </View>
  );
}
export function LoginScreen({
  children,
  title,
  description,
  backDisabled = false,
  privacy = true,
}: {
  children: ReactNode;
  title?: string;
  description?: string | undefined;
  backDisabled?: boolean;
  privacy?: boolean;
}) {
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
        <KeyboardAvoidingView
          style={styles.safe}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={styles.scroll}
          >
            <View style={styles.content}>
              {title ? <AuthBack disabled={backDisabled} /> : null}
              <View style={styles.brand}>
                <LoginLogo />
                <Text accessibilityRole="header" style={styles.brandText}>
                  HSM
                </Text>
                <Text style={styles.subtitle}>HOSTEL MARKETPLACE</Text>
              </View>
              <View testID="login-glass-card" style={styles.card}>
                <LoginGlass />
                {title ? <AuthIntro title={title} description={description} /> : null}
                {children}
                {title ? privacy ? <AuthPrivacy /> : null : <LoginOptions />}
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
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: c.background },
  safe: { flex: 1 },
  scroll: { flexGrow: 1 },
  content: {
    width: '100%',
    maxWidth: m.maxWidth,
    alignSelf: 'center',
    paddingHorizontal: m.xxl,
    paddingTop: m.xxl,
  },
  brand: { alignItems: 'center', marginBottom: m.sm + m.xs },
  brandText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: c.dark,
    fontSize: m.brandSize,
    lineHeight: m.brandLine,
    letterSpacing: m.wordmarkTracking,
    marginTop: m.xs,
  },
  subtitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: c.secondary,
    fontSize: m.subtitleSize,
    lineHeight: m.subtitleLine,
    letterSpacing: m.subtitleTracking,
    textAlign: 'center',
    marginTop: m.xs,
  },
  card: {
    borderRadius: m.cardRadius,
    borderWidth: 1.5,
    borderColor: mobileSurfaces.icyCard.borderColor,
    backgroundColor: c.glass,
    padding: m.xxl,
    paddingBottom: m.md,
    justifyContent: 'center',
    boxShadow: mobileSurfaces.glassEdge.boxShadow,
  },
  link: {
    minHeight: m.touch,
    paddingHorizontal: m.xs,
    justifyContent: 'center',
    paddingVertical: m.sm,
    borderRadius: m.sm,
  },
  linkText: {
    includeFontPadding: false,
    textAlignVertical: 'center',
    color: c.primary,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: m.fieldSize,
    textAlign: 'center',
  },
  underline: { textDecorationLine: 'underline', fontFamily: 'PlusJakartaSans_400Regular' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: m.md, minHeight: m.section },
  dividerText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: m.subtitleSize,
    color: c.secondary,
    letterSpacing: m.dividerTracking,
  },
  rule: { height: 1, backgroundColor: c.divider, flex: 1 },
  guest: {
    minHeight: m.buttonHeight - m.sm,
    borderRadius: m.buttonRadius,
    borderWidth: 1.3,
    borderColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: m.md,
    paddingHorizontal: m.sm,
  },
  guestContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: m.lg,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '100%',
  },
  guestText: {
    includeFontPadding: false,
    textAlignVertical: 'center',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: m.controlSize,
    color: c.heading,
    textAlign: 'center',
    flexShrink: 1,
  },
  landscape: { marginTop: 'auto', paddingTop: m.xxl },
});
