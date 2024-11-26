import { useId, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { ArrowUpRight, TrendingUp } from 'lucide-react-native';
import { mobileOwnerColors as c } from '@hsm/ui';
import { dashboardCardStyles as s } from './owner-dashboard-cards';
import { monthName } from './owner-month';
import { paisaText } from './owner-status';
type Point = { month: string; collectedPaisa: number };
const TOP = 14,
  LEFT = 44,
  RIGHT = 14;
// OWN-004: all coordinates fill the measured card width; tap targets cover complete
// month columns and keep native scrolling. Selecting never manufactures income.
export function OwnerIncomeTrend({
  points,
  onChooseMonth,
}: {
  points: Point[];
  onChooseMonth?: ((month: string) => void) | undefined;
}) {
  const id = useId().replaceAll(':', '');
  const [width, setWidth] = useState(360);
  const [picked, setPicked] = useState<string>();
  const found = points.findIndex((point) => point.month === picked);
  const index = found >= 0 ? found : points.length - 1;
  const selected = points[index],
    previous = points[index - 1];
  const hasCollections = points.some((point) => point.collectedPaisa > 0);
  const height = hasCollections ? 190 : 104,
    base = height - 32;
  const max = Math.max(100, ...points.map((point) => point.collectedPaisa));
  const plotWidth = Math.max(1, width - LEFT - RIGHT);
  const xy = points.map((point, i) => ({
    x: points.length === 1 ? LEFT + plotWidth / 2 : LEFT + (i * plotWidth) / (points.length - 1),
    y: base - (point.collectedPaisa / max) * (base - TOP),
  }));
  const active = xy[index];
  const path = xy
    .map((point, i) => {
      const previous = xy[i - 1];
      if (!previous) return `M${point.x},${point.y}`;
      const middle = (previous.x + point.x) / 2;
      return `C${middle},${previous.y} ${middle},${point.y} ${point.x},${point.y}`;
    })
    .join(' ');
  const change =
    selected && previous && previous.collectedPaisa > 0
      ? (selected.collectedPaisa / previous.collectedPaisa - 1) * 100
      : undefined;
  return (
    <View style={s.card}>
      <View style={[s.row, { justifyContent: 'space-between', flexWrap: 'wrap' }]}>
        <View style={s.row}>
          <TrendingUp size={24} color={c.primary} />
          <Text className="font-heading" style={[s.label, { fontSize: 18 }]}>
            Income Trend
          </Text>
        </View>
        {selected ? (
          <Pressable
            pointerEvents={onChooseMonth ? 'auto' : 'none'}
            accessibilityRole={onChooseMonth ? 'button' : 'text'}
            accessibilityLabel={'Open ' + monthName(selected.month) + ' dashboard'}
            disabled={!onChooseMonth}
            onPress={() => onChooseMonth?.(selected.month)}
            style={styles.tooltip}
          >
            <Text accessibilityLiveRegion="polite" className="font-heading" style={styles.month}>
              {monthName(selected.month)}
            </Text>
            <Text
              className="font-heading"
              numberOfLines={1}
              adjustsFontSizeToFit
              style={styles.amount}
            >
              {paisaText(selected.collectedPaisa)}
            </Text>
            {change !== undefined && previous ? (
              <Text style={styles.change}>
                {change >= 0 ? '+' : ''}
                {change.toFixed(1)}% vs{' '}
                {new Date(previous.month + '-01T00:00:00Z').toLocaleDateString('en-PK', {
                  month: 'short',
                  timeZone: 'UTC',
                })}
              </Text>
            ) : null}
            {onChooseMonth ? (
              <ArrowUpRight size={13} color={c.onPrimary} style={styles.arrow} />
            ) : null}
          </Pressable>
        ) : null}
      </View>
      {selected && active ? (
        <View
          style={[styles.plot, { height }]}
          onLayout={(event) => {
            const value = event.nativeEvent.layout.width;
            if (value > 0) setWidth(value);
          }}
        >
          <Svg
            pointerEvents="none"
            accessible={false}
            width="100%"
            height={height}
            viewBox={`0 0 ${width} ${height}`}
          >
            <Defs>
              <LinearGradient id={id + 'fill'} x1="0%" y1="0%" x2="0%" y2="100%">
                <Stop offset="0" stopColor={c.primary} stopOpacity={0.42} />
                <Stop offset="1" stopColor={c.primary} stopOpacity={0.03} />
              </LinearGradient>
            </Defs>
            {(hasCollections ? [0, 0.25, 0.5, 0.75, 1] : [0]).map((r) => (
              <Line
                key={r}
                x1={LEFT}
                x2={width - RIGHT}
                y1={base - r * (base - TOP)}
                y2={base - r * (base - TOP)}
                stroke={c.border}
              />
            ))}
            {(hasCollections ? [0, 0.25, 0.5, 0.75, 1] : [0]).map((r) => (
              <SvgText
                key={r}
                x={LEFT - 7}
                y={base - r * (base - TOP) + 4}
                textAnchor="end"
                fill={c.secondary}
                fontSize={11}
              >
                {new Intl.NumberFormat('en-PK', {
                  notation: 'compact',
                  maximumFractionDigits: 1,
                }).format(Math.round(max * r) / 100)}
              </SvgText>
            ))}
            <Path
              d={`${path} L${xy.at(-1)?.x ?? LEFT},${base} L${xy[0]?.x ?? LEFT},${base} Z`}
              fill={'url(#' + id + 'fill)'}
            />
            <Path d={path} fill="none" stroke={c.primary} strokeWidth={3.5} />
            <Line
              x1={active.x}
              x2={active.x}
              y1={active.y}
              y2={base}
              stroke={c.primary}
              strokeOpacity={0.3}
              strokeDasharray="3 4"
            />
            <Circle cx={active.x} cy={active.y} r={11} fill={c.primary} opacity={0.13} />
            {xy.map((point, i) => (
              <Circle
                key={points[i]?.month}
                cx={point.x}
                cy={point.y}
                r={i === index ? 6 : 4.5}
                fill={c.primary}
                stroke={c.surface}
                strokeWidth={2}
              />
            ))}
            {points.map((point, i) => (
              <SvgText
                key={point.month}
                x={xy[i]?.x ?? LEFT}
                y={height - 9}
                textAnchor="middle"
                fill={i === index ? c.primary : c.secondary}
                fontWeight={i === index ? '700' : '400'}
                fontSize={12}
              >
                {new Date(point.month + '-01T00:00:00Z').toLocaleDateString('en-PK', {
                  month: 'short',
                  timeZone: 'UTC',
                })}
              </SvgText>
            ))}
          </Svg>
          {!hasCollections ? (
            <Text pointerEvents="none" style={styles.empty}>
              No collections in this period
            </Text>
          ) : null}
          {points.map((point, i) => {
            const x = xy[i]?.x ?? 0;
            const left = i === 0 ? 0 : ((xy[i - 1]?.x ?? 0) + x) / 2;
            const right = i === points.length - 1 ? width : (x + (xy[i + 1]?.x ?? width)) / 2;
            return (
              <Pressable
                key={point.month}
                accessibilityRole="button"
                accessibilityLabel={
                  'View ' +
                  monthName(point.month) +
                  ' collection: ' +
                  paisaText(point.collectedPaisa)
                }
                accessibilityState={{ selected: i === index }}
                onPress={() => setPicked(point.month)}
                style={[styles.hit, { left, width: right - left }]}
              />
            );
          })}
        </View>
      ) : (
        <Text style={{ color: c.secondary }}>Trend unavailable</Text>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  empty: {
    position: 'absolute',
    top: 24,
    left: LEFT,
    right: RIGHT,
    color: c.secondary,
    fontSize: 13,
    textAlign: 'center',
  },
  plot: { width: '100%' },
  hit: { position: 'absolute', top: 0, bottom: 0 },
  tooltip: {
    width: 140,
    minHeight: 44,
    paddingHorizontal: 15,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  month: { fontSize: 10, color: c.onPrimary },
  amount: { fontSize: 15, fontWeight: '800', color: c.onPrimary },
  arrow: { position: 'absolute', right: 5, top: 15 },
  change: { color: c.onPrimary, opacity: 0.85, fontSize: 9, fontWeight: '600' },
});
