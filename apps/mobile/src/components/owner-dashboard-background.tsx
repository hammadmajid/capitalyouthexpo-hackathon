import { StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { mobileColors as c } from '@hsm/ui';
// Dashboard-only foliage, painted in code and reused behind transparent cards.
export function OwnerDashboardBackground() {
  return (
    <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox="0 0 420 900" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id="ownerMint" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={c.aqua} />
            <Stop offset="0.45" stopColor={c.icy} />
            <Stop offset="1" stopColor={c.aqua} />
          </LinearGradient>
          <RadialGradient id="ownerLight" cx="40%" cy="32%" r="80%">
            <Stop offset="0" stopColor={c.surface} stopOpacity={0.72} />
            <Stop offset="1" stopColor={c.surface} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id="ownerLeaf" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={c.success} />
            <Stop offset="1" stopColor={c.primary} />
          </LinearGradient>
        </Defs>
        <Rect width={420} height={900} fill="url(#ownerMint)" />
        <Rect width={420} height={900} fill={c.primary} opacity={0.055} />
        <Rect width={420} height={900} fill="url(#ownerLight)" />
        <Circle cx={425} cy={390} r={170} fill={c.primary} opacity={0.045} />
        <G opacity={0.5} transform="translate(238 -25) rotate(22)">
          <Path d="M0 0 Q34 31 94 68" stroke={c.primary} strokeWidth={1.5} fill="none" />
          <Leaf x={15} y={10} angle={-24} />
          <Leaf x={43} y={31} angle={66} />
          <Leaf x={70} y={49} angle={-18} />
        </G>
        <G opacity={0.23} transform="translate(-24 700) rotate(-18)">
          <Path d="M0 150 Q27 86 54 0" stroke={c.primary} strokeWidth={2} fill="none" />
          <Leaf x={20} y={105} angle={-75} />
          <Leaf x={32} y={65} angle={10} />
          <Leaf x={45} y={23} angle={-68} />
        </G>
        <G opacity={0.25} transform="translate(430 555) rotate(150)">
          <Path d="M0 0 Q35 35 92 78" stroke={c.primary} strokeWidth={1.5} fill="none" />
          <Leaf x={12} y={10} angle={-18} />
          <Leaf x={40} y={35} angle={78} />
          <Leaf x={70} y={60} angle={-14} />
        </G>
      </Svg>
    </View>
  );
}
function Leaf({ x, y, angle }: { x: number; y: number; angle: number }) {
  return (
    <G transform={`translate(${x} ${y}) rotate(${angle})`}>
      <Path d="M0 0 Q12 -29 43 -24 Q40 -1 0 0Z" fill="url(#ownerLeaf)" />
      <Path
        d="M1 -1 Q20 -13 40 -23 M16 -10 L20 -24 M25 -16 L36 -12"
        stroke={c.surface}
        strokeOpacity={0.35}
        strokeWidth={0.7}
        fill="none"
      />
    </G>
  );
}
