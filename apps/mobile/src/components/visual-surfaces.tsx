import { useId, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Stop,
  Rect,
  Path,
  Circle,
} from 'react-native-svg';
import { mobileColors as colors, radii, spacing } from '@hsm/ui';

export function NatureBackground({ mint = false }: { mint?: boolean } = {}) {
  return <PremiumSurface background mint={mint} />;
}
export function PremiumSurface({
  dark = false,
  background = false,
  mint = false,
}: {
  dark?: boolean;
  background?: boolean;
  mint?: boolean;
}) {
  const id = useId().replaceAll(':', '');
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      <Svg width="100%" height="100%" viewBox="0 0 500 300" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0" stopColor={dark ? colors.primary : colors.surface} />
            <Stop offset="0.58" stopColor={dark ? colors.deep : colors.background} />
            <Stop offset="1" stopColor={dark ? colors.deep : mint ? colors.aqua : colors.icy} />
          </LinearGradient>
          <RadialGradient id={id + 'glow'} cx="18%" cy="4%" rx="85%" ry="95%">
            <Stop
              offset="0"
              stopColor={dark ? colors.success : colors.aqua}
              stopOpacity={dark ? 0.62 : 0.6}
            />
            <Stop offset="0.45" stopColor={dark ? colors.accent : colors.icy} stopOpacity="0.22" />
            <Stop offset="1" stopColor={dark ? colors.accent : colors.icy} stopOpacity="0" />
          </RadialGradient>
          <LinearGradient id={id + 'fade'} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0" stopColor={colors.surface} stopOpacity="0" />
            <Stop offset="0.35" stopColor={colors.surface} stopOpacity={dark ? 0.2 : 0.65} />
            <Stop offset="0.7" stopColor={colors.aqua} stopOpacity={dark ? 0.1 : 0.25} />
            <Stop offset="1" stopColor={colors.aqua} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect width="500" height="300" fill={'url(#' + id + ')'} />
        <Rect width="500" height="300" fill={'url(#' + id + 'glow)'} />
        <Path
          d="M290 -80 C300 65 360 180 560 150 L560 -80Z"
          fill={'url(#' + id + 'fade)'}
          opacity={dark ? 0.65 : 0.3}
        />
        <Path
          d="M290 -80 C300 65 360 180 560 150"
          fill="none"
          stroke={'url(#' + id + 'fade)'}
          strokeWidth="1.2"
        />
        <Path
          d="M-50 260 C150 170 310 360 550 220 L550 350 L-50 350Z"
          fill={'url(#' + id + 'fade)'}
          opacity="0.25"
        />
        {mint ? (
          <>
            <Path
              d="M-30 25 C135 88 359 -20 530 9 L530 -20 L-30 -20Z"
              fill={colors.surface}
              opacity="0.5"
            />
            <Path
              d="M-20 282 C208 311 367 214 520 264 L520 320 L-20 320Z"
              fill={colors.accent}
              opacity="0.10"
            />
          </>
        ) : null}
        {background && !mint ? (
          <>
            <Path d="M-25 8Q75-10 112 80Q22 86-25 8Z" fill={colors.accent} opacity="0.045" />
            <Path
              d="M416 235Q505 208 535 290Q454 309 416 235Z"
              fill={colors.primary}
              opacity="0.04"
            />
          </>
        ) : null}
      </Svg>
    </View>
  );
}
export function GlassIcon({ children }: { children: ReactNode }) {
  const id = useId().replaceAll(':', '');
  return (
    <View style={glass.icon}>
      <Svg
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        width="100%"
        height="100%"
        viewBox="0 0 48 48"
      >
        <Defs>
          <RadialGradient id={id} cx="25%" cy="15%" r="90%">
            <Stop offset="0" stopColor={colors.surface} stopOpacity="0.48" />
            <Stop offset="0.48" stopColor={colors.success} stopOpacity="0.32" />
            <Stop offset="1" stopColor={colors.surface} stopOpacity="0.12" />
          </RadialGradient>
        </Defs>
        <Circle
          cx="24"
          cy="24"
          r="23"
          fill={'url(#' + id + ')'}
          stroke={colors.aqua}
          strokeOpacity="0.6"
          strokeWidth="0.8"
        />
      </Svg>
      {children}
    </View>
  );
}
const glass = StyleSheet.create({
  icon: {
    width: spacing.touch,
    height: spacing.touch,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
export const premiumShadow = {
  shadowColor: colors.primary,
  shadowOffset: { width: 0, height: spacing.xs },
  shadowOpacity: 0.07,
  shadowRadius: spacing.lg,
  elevation: 1,
};
