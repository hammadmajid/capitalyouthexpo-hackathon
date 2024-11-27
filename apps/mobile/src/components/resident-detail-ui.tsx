import { StyleSheet, Text, View } from 'react-native';
import { useId } from 'react';
import type { LucideIcon } from 'lucide-react-native';
import { mobileColors as c, mobileSurfaces } from '@hsm/ui';
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
export const residentStyles = StyleSheet.create({
  card: {
    ...mobileSurfaces.icyCard,
    boxShadow: [],
    backgroundColor: c.surface + '85',
    borderColor: c.accent + '38',
    borderWidth: 0.65,
    elevation: 0,
    shadowOpacity: 0,
    borderRadius: 19,
    padding: 11,
    gap: 9,
    overflow: 'hidden',
  },
  inset: {
    ...mobileSurfaces.icyCard,
    boxShadow: [],
    backgroundColor: c.surface + '99',
    borderColor: c.accent + '29',
    borderWidth: 0.65,
    elevation: 0,
    shadowOpacity: 0,
    borderRadius: 14,
    overflow: 'hidden',
    padding: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heading: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, color: c.heading, flexShrink: 1 },
  body: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 11, color: c.text },
  value: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, color: c.heading },
  muted: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 11, color: c.secondary },
  iconButton: {
    ...mobileSurfaces.icyCard,
    backgroundColor: c.surface + '80',
    borderColor: c.surface,
    borderWidth: 1,
    borderRadius: 12,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    borderRadius: 20,
    backgroundColor: c.aqua,
    paddingHorizontal: 9,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.success },
});
// RES-004: native SVG corner light gives translucent panels depth without Android's
// opaque elevation/shadow rectangles. Decoration never receives focus or touches.
export function ResidentGlassCorners() {
  const id = useId().replaceAll(':', '');
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      <Svg width="100%" height="100%" viewBox="0 0 400 180" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id={id + 'green'} cx="100%" cy="100%" rx="80%" ry="110%">
            <Stop offset="0" stopColor={c.accent} stopOpacity="0.20" />
            <Stop offset="0.5" stopColor={c.aqua} stopOpacity="0.32" />
            <Stop offset="1" stopColor={c.surface} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id={id + 'light'} cx="0%" cy="0%" rx="85%" ry="120%">
            <Stop offset="0" stopColor={c.surface} stopOpacity="0.82" />
            <Stop offset="0.55" stopColor={c.aqua} stopOpacity="0.14" />
            <Stop offset="1" stopColor={c.surface} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width="400" height="180" fill={'url(#' + id + 'green)'} />
        <Rect width="400" height="180" fill={'url(#' + id + 'light)'} />
        <Path
          d="M1 50V20Q1 1 20 1H245"
          fill="none"
          stroke={c.surface}
          strokeOpacity="0.85"
          strokeWidth="1.5"
        />
        <Path
          d="M399 130V160Q399 179 380 179H270"
          fill="none"
          stroke={c.accent}
          strokeOpacity="0.18"
        />
      </Svg>
    </View>
  );
}
export function ResidentSectionTitle({ title, Icon }: { title: string; Icon: LucideIcon }) {
  return (
    <View style={residentStyles.row}>
      <Icon size={21} color={c.primary} />
      <Text style={residentStyles.heading}>{title}</Text>
    </View>
  );
}

export function ResidentHouseArt() {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', right: -9, bottom: -7, opacity: 0.4 }}
    >
      <Svg width={140} height={91} viewBox="0 0 160 104">
        <Circle cx={63} cy={85} r={43} fill={c.aqua} />
        <Circle cx={117} cy={56} r={48} fill={c.aqua} />
        <Path d="M89 58 120 29 153 58V100H92Z" fill={c.accent} opacity={0.12} />
        <Path d="m86 58 34-33 36 33-6 5-30-27-29 27Z" fill={c.primary} opacity={0.2} />
        <Path d="M43 64 79 35 116 65V103H43Z" fill={c.surface} opacity={0.8} />
        <Path d="m37 65 42-36 43 36-5 5-38-31-37 31Z" fill={c.accent} opacity={0.32} />
        <Path
          d="M68 104V81a12 12 0 0 1 24 0v23Zm-17-32h8v13h-8Zm48 0h8v13h-8Z"
          fill={c.primary}
          opacity={0.15}
        />
      </Svg>
    </View>
  );
}
