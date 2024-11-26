import { StyleSheet, View } from 'react-native';
import Svg, {
  Path,
  Rect,
  G,
  Ellipse,
  Defs,
  LinearGradient,
  RadialGradient,
  Stop,
} from 'react-native-svg';
import { natureLoginColors as c, natureLoginMetrics as m } from '@hsm/ui';
// AUTH-C: original local vectors. Decorative layers never receive touch or focus.
const decoration = {
  accessible: false,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants' as const,
  pointerEvents: 'none' as const,
};
export function LoginLogo() {
  return (
    <Svg {...decoration} width={m.logoSize} height={m.logoSize} viewBox="0 0 100 100">
      <Path
        d="M7 47 50 7 93 47"
        fill="none"
        stroke={c.dark}
        strokeWidth="9"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Path d="M23 46H77V94H23Z" fill={c.primary} />
      <G
        stroke={c.surface}
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Path d="M34 61V89M72 62V89M34 77H72M34 86H72M38 68H68V77H38Z" />
        <Rect x="39" y="61" width="17" height="8" rx="3" fill={c.surface} stroke="none" />
      </G>
    </Svg>
  );
}
function Leaf({ transform, opacity = 0.55 }: { transform: string; opacity?: number }) {
  return (
    <G transform={transform} opacity={opacity}>
      <Path d="M0 0Q57-9 84 66Q29 73 0 0Z" fill="url(#botanical)" />
      <Path
        d="M3 3Q44 25 79 62"
        fill="none"
        stroke={c.window}
        strokeOpacity="0.3"
        strokeWidth="1"
      />
    </G>
  );
}
export function LoginBackdrop() {
  return (
    <Svg
      {...decoration}
      width="100%"
      height="100%"
      viewBox="0 0 440 940"
      preserveAspectRatio="xMidYMid slice"
    >
      <Defs>
        <LinearGradient id="nature-base" x1="0" y1="0" x2="100%" y2="100%">
          <Stop stopColor={c.sage} />
          <Stop offset="0.38" stopColor={c.background} />
          <Stop offset="0.75" stopColor={c.background} />
          <Stop offset="1" stopColor={c.green} />
        </LinearGradient>
        <LinearGradient id="cream-ribbon" x1="0" y1="0" x2="100%" y2="100%">
          <Stop stopColor={c.cream} />
          <Stop offset="1" stopColor={c.window} />
        </LinearGradient>
        <LinearGradient id="botanical" x1="0" y1="0" x2="100%" y2="100%">
          <Stop stopColor={c.green} />
          <Stop offset="0.55" stopColor={c.foliage} />
          <Stop offset="1" stopColor={c.glow} />
        </LinearGradient>
        <RadialGradient id="nature-glow">
          <Stop stopColor={c.surface} stopOpacity="0.85" />
          <Stop offset="1" stopColor={c.surface} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="cream-glow">
          <Stop stopColor={c.glow} stopOpacity="0.5" />
          <Stop offset="1" stopColor={c.glow} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect width="440" height="940" fill="url(#nature-base)" />
      <Ellipse cx="250" cy="215" rx="265" ry="190" fill="url(#nature-glow)" />
      <Path d="M0 143Q180 47 440 4V48Q191 91 0 209Z" fill="url(#cream-ribbon)" />
      <Ellipse cx="390" cy="520" rx="100" ry="330" fill="url(#cream-glow)" />
      <Ellipse cx="150" cy="630" rx="195" ry="280" fill="url(#nature-glow)" />
      <Leaf transform="translate(15 150) rotate(-8)" />
      <Leaf transform="translate(327 147) rotate(-12)" />
      <Leaf transform="translate(421 366) rotate(60) scale(1.2)" opacity={0.32} />
      <Leaf transform="translate(7 397) rotate(53) scale(1.5)" opacity={0.26} />
      <Leaf transform="translate(-20 648) rotate(-45) scale(1.1)" opacity={0.5} />
      <Path
        d="M-30 776Q80 699 148 745T313 768Q369 696 470 732V940H-30Z"
        fill={c.hill}
        opacity="0.3"
      />
    </Svg>
  );
}
export function LoginGlass() {
  return (
    <View {...decoration} style={StyleSheet.absoluteFill}>
      <Svg {...decoration} width="100%" height="100%">
        <Defs>
          <LinearGradient id="glass-surface" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop stopColor={c.selected} stopOpacity="0.4" />
            <Stop offset="0.4" stopColor={c.selected} stopOpacity="0.12" />
            <Stop offset="0.78" stopColor={c.selected} stopOpacity="0.24" />
            <Stop offset="1" stopColor={c.selected} stopOpacity="0.2" />
          </LinearGradient>
          <LinearGradient id="glass-rim" x1="0%" y1="0%" x2="100%" y2="50%">
            <Stop stopColor={c.surface} stopOpacity="0.78" />
            <Stop offset="0.5" stopColor={c.surface} stopOpacity="0.18" />
            <Stop offset="1" stopColor={c.surface} stopOpacity="0.64" />
          </LinearGradient>
        </Defs>
        <Rect
          x="1%"
          y="0.5%"
          width="98%"
          height="99%"
          rx={m.cardRadius - m.xs}
          fill="url(#glass-surface)"
          stroke="url(#glass-rim)"
          strokeWidth="4"
        />
      </Svg>
    </View>
  );
}
function Tree({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <G transform={'translate(' + x + ' ' + y + ') scale(' + scale + ')'}>
      <Ellipse cx="0" cy="-36" rx="27" ry="32" fill="url(#tree-canopy)" />
      <Path d="M0 5V-47" stroke={c.primary} strokeWidth="2" strokeLinecap="round" />
    </G>
  );
}
function Building({
  x,
  y,
  width,
  height,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  return (
    <G>
      <Rect x={x} y={y} width={width} height={height} rx="2" fill={c.building} />
      <Rect x={x + 7} y={y + 17} width="8" height="10" fill={c.window} />
      <Rect x={x + width - 15} y={y + 17} width="8" height="10" fill={c.window} />
    </G>
  );
}
export function LoginLandscape() {
  return (
    <Svg
      {...decoration}
      width="100%"
      height={m.landscapeHeight}
      viewBox="0 0 440 190"
      preserveAspectRatio="xMidYMax slice"
    >
      <Defs>
        <LinearGradient id="landscape-haze" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop stopColor={c.hill} stopOpacity="0.45" />
          <Stop offset="1" stopColor={c.green} />
        </LinearGradient>
        <LinearGradient id="tree-canopy">
          <Stop stopColor={c.tree} />
          <Stop offset="1" stopColor={c.green} />
        </LinearGradient>
        <LinearGradient id="foreground-hill" x1="0%" y1="0%" x2="40%" y2="100%">
          <Stop stopColor={c.glow} stopOpacity="0.5" />
          <Stop offset="1" stopColor={c.green} />
        </LinearGradient>
      </Defs>
      <Path d="M0 69Q94-11 171 52Q285 3 364 22Q409 32 440 68V190H0Z" fill={c.hill} opacity="0.5" />
      <Path
        d="M0 83Q87-3 169 52Q194 69 213 88Q266 30 331 59Q394 69 440 108V190H0Z"
        fill="url(#landscape-haze)"
      />
      <Path d="M0 83Q87-3 169 52Q194 69 213 88" fill="none" stroke={c.window} strokeOpacity="0.7" />
      <Path
        d="M0 119Q44 88 84 109Q139 161 206 123Q278 72 336 106Q390 71 440 115V190H0Z"
        fill={c.green}
        opacity="0.6"
      />
      <Building x={80} y={72} width={37} height={52} />
      <Building x={146} y={92} width={33} height={37} />
      <Building x={281} y={82} width={48} height={58} />
      <Tree x={44} y={139} scale={1.1} />
      <Tree x={205} y={145} scale={0.7} />
      <Tree x={367} y={141} scale={1.22} />
      <Tree x={405} y={142} scale={0.7} />
      <Path
        d="M0 140Q91 119 174 146Q262 188 365 132Q411 120 440 136V190H0Z"
        fill="url(#foreground-hill)"
      />
    </Svg>
  );
}
