import { useEffect, useId, useRef } from 'react';
import { AccessibilityInfo, Animated, StyleSheet } from 'react-native';
import Svg, {
  Defs,
  G,
  Image as SvgImage,
  LinearGradient,
  Mask,
  Rect,
  Stop,
  Use,
} from 'react-native-svg';
import { mobileOwnerColors as c } from '@hsm/ui';
// Alpha masks blend the approved image into the real dashboard backdrop. Native text
// and controls are outside this layer. One gentle entrance, never a flashing loop.
export function OwnerHeroImage({
  bleed = { top: 0, horizontal: 0, bottom: 0 },
}: {
  bleed?: { top: number; horizontal: number; bottom: number };
}) {
  const id = useId().replaceAll(':', '');
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (!active) return;
        if (reduced) opacity.setValue(1);
        else Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }).start();
      })
      .catch(() => {
        if (active) opacity.setValue(1);
      });
    return () => {
      active = false;
      opacity.stopAnimation();
    };
  }, [opacity]);
  return (
    <Animated.View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        StyleSheet.absoluteFill,
        {
          opacity,
          top: -bleed.top,
          left: -bleed.horizontal,
          right: -bleed.horizontal,
          bottom: -bleed.bottom,
        },
      ]}
    >
      <Svg width="100%" height="100%" viewBox="0 0 1000 400" preserveAspectRatio="xMaxYMid slice">
        <Defs>
          <SvgImage
            id={id + 'photo'}
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            href={require('../../assets/owner-mosque-hero-v2.png')}
            width={1000}
            height={400}
            preserveAspectRatio="xMidYMid slice"
          />
          <LinearGradient
            id={id + 'text'}
            x1={300}
            y1={0}
            x2={690}
            y2={0}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor={c.surface} stopOpacity={0.78} />
            <Stop offset="0.45" stopColor={c.surface} stopOpacity={0.48} />
            <Stop offset="1" stopColor={c.surface} stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id={id + 'y'} x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0" stopColor={c.surface} />
            <Stop offset="0.7" stopColor={c.surface} />
            <Stop offset="1" stopColor={c.surface} stopOpacity={0} />
          </LinearGradient>
          <Mask id={id + 'my'} x={0} y={0} width={1000} height={400} maskUnits="userSpaceOnUse">
            <Rect width={1000} height={400} fill={'url(#' + id + 'y)'} />
          </Mask>
        </Defs>
        <G mask={'url(#' + id + 'my)'}>
          {/* Reuse the photo behind the offset layer to keep the exposed edges covered. */}
          <Use href={'#' + id + 'photo'} />
          <Use href={'#' + id + 'photo'} transform="translate(84 35) scale(0.92)" />
          <Rect width={1000} height={400} fill={'url(#' + id + 'text)'} />
        </G>
      </Svg>
    </Animated.View>
  );
}
