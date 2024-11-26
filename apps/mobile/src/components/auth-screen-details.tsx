import { router } from 'expo-router';
import { ArrowLeft, ShieldCheck } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { icons, natureLoginColors as c, natureLoginMetrics as m } from '@hsm/ui';

export function AuthBack({ disabled }: { disabled: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/auth/login'))}
      android_ripple={{ color: c.divider }}
      style={styles.back}
    >
      <ArrowLeft
        accessible={false}
        size={m.iconSize}
        color={c.primary}
        strokeWidth={icons.strokeWidth}
      />
    </Pressable>
  );
}
export function AuthIntro({
  title,
  description,
}: {
  title: string;
  description?: string | undefined;
}) {
  return (
    <View style={styles.intro}>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
    </View>
  );
}
export function AuthPrivacy() {
  return (
    <View style={styles.privacy}>
      <View style={styles.shield}>
        <ShieldCheck
          accessible={false}
          size={m.iconSize + m.sm}
          color={c.primary}
          strokeWidth={icons.strokeWidth}
        />
      </View>
      <Text style={styles.privacyText}>
        Your account details are private. Never share your password or email codes.
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  back: {
    position: 'absolute',
    left: m.xxl,
    top: m.xxl,
    zIndex: 1,
    width: m.touch,
    height: m.touch,
    borderRadius: m.inputRadius,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.input,
    borderWidth: 1,
    borderColor: c.glassHighlight,
    boxShadow: [{ offsetX: 0, offsetY: m.xs, blurRadius: m.md, color: c.softShadow }],
  },
  intro: { gap: m.sm, marginBottom: m.xxl, alignItems: 'center' },
  title: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: c.heading,
    textAlign: 'center',
    fontSize: m.authTitleSize,
    lineHeight: m.authTitleLine,
  },
  description: {
    fontFamily: 'PlusJakartaSans_400Regular',
    color: c.secondary,
    fontSize: m.fieldSize,
    lineHeight: m.xxl,
    textAlign: 'center',
  },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: m.lg, marginTop: m.xxl },
  shield: { padding: m.sm, backgroundColor: c.selector, borderRadius: m.inputRadius },
  privacyText: {
    flex: 1,
    borderLeftWidth: 1,
    borderLeftColor: c.outline,
    paddingLeft: m.lg,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: c.secondary,
    fontSize: m.fieldSize,
    lineHeight: m.xxl,
  },
});
