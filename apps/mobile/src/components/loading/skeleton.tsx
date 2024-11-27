import { mobileSurfaces } from '@hsm/ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from 'react-native';
import { mobileColors as colors, radii, spacing } from '@hsm/ui';
export type SkeletonKind =
  'list' | 'listing' | 'details' | 'form' | 'stats' | 'dashboard' | 'table' | 'chat' | 'inline';
export function SkeletonBlock({
  width = '100%',
  height = spacing.lg,
}: {
  width?: number | `${number}%`;
  height?: number;
}) {
  return <View style={{ width, height, backgroundColor: colors.aqua, borderRadius: radii.sm }} />;
}
function Placeholder({ kind }: { kind: SkeletonKind }) {
  if (kind === 'inline') return <SkeletonBlock width="72%" height={spacing.xl} />;
  if (kind === 'stats')
    return (
      <View style={s.row}>
        {[0, 1, 2].map((n) => (
          <View key={n} style={s.stat}>
            <SkeletonBlock width="45%" height={spacing.section} />
            <SkeletonBlock width="80%" />
          </View>
        ))}
      </View>
    );
  if (kind === 'form')
    return (
      <View style={s.card}>
        {[0, 1, 2].map((n) => (
          <View key={n} style={s.gap}>
            <SkeletonBlock width="40%" />
            <SkeletonBlock height={spacing.touch} />
          </View>
        ))}
        <SkeletonBlock height={spacing.touch} />
      </View>
    );
  if (kind === 'table')
    return (
      <View style={s.card}>
        {[0, 1, 2, 3].map((n) => (
          <View key={n} style={s.row}>
            <SkeletonBlock width="25%" height={spacing.touch} />
            <View style={s.grow}>
              <SkeletonBlock width="88%" />
              <SkeletonBlock width="55%" />
            </View>
          </View>
        ))}
      </View>
    );
  if (kind === 'chat')
    return (
      <View style={s.gap}>
        {[0, 1, 2, 3].map((n) => (
          <View key={n} style={[s.message, { alignSelf: n % 2 ? 'flex-end' : 'flex-start' }]}>
            <SkeletonBlock width="85%" />
            <SkeletonBlock width="60%" />
          </View>
        ))}
      </View>
    );
  if (kind === 'dashboard')
    return (
      <View style={s.gap}>
        <SkeletonBlock height={spacing.touch * 3} />
        <Placeholder kind="stats" />
        <Placeholder kind="list" />
      </View>
    );
  if (kind === 'details')
    return (
      <View style={s.card}>
        <SkeletonBlock height={spacing.touch * 3} />
        <SkeletonBlock width="72%" height={spacing.section} />
        {[0, 1, 2, 3].map((n) => (
          <SkeletonBlock key={n} width={n % 2 ? '68%' : '92%'} />
        ))}
      </View>
    );
  return (
    <View style={s.gap}>
      {[0, 1, 2].map((n) => (
        <View key={n} style={s.card}>
          {kind === 'listing' ? <SkeletonBlock height={spacing.touch * 3} /> : null}
          <View style={s.row}>
            <SkeletonBlock width={spacing.touch} height={spacing.touch} />
            <View style={s.grow}>
              <SkeletonBlock width="78%" height={spacing.xl} />
              <SkeletonBlock width="52%" />
            </View>
          </View>
          <SkeletonBlock width="85%" />
          <SkeletonBlock height={spacing.touch} />
        </View>
      ))}
    </View>
  );
}
export function Skeleton({
  kind = 'list',
  label = 'Loading content',
}: {
  kind?: SkeletonKind;
  label?: string;
}) {
  const opacity = useRef(new Animated.Value(0.65)).current;
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    let active = true;
    let loop: Animated.CompositeAnimation | undefined;
    void Promise.resolve(AccessibilityInfo.isReduceMotionEnabled?.() ?? true)
      .then((reduced) => {
        if (!active || reduced) {
          opacity.setValue(1);
          return;
        }
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(opacity, {
              toValue: 1,
              duration: 950,
              useNativeDriver: true,
              isInteraction: false,
            }),
            Animated.timing(opacity, {
              toValue: 0.65,
              duration: 950,
              useNativeDriver: true,
              isInteraction: false,
            }),
          ]),
        );
        loop.start();
      })
      .catch(() => opacity.setValue(1));
    const listener = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (reduced) => {
      if (reduced) {
        loop?.stop();
        opacity.setValue(1);
      }
    });
    const timer = setTimeout(() => {
      if (active) setSlow(true);
    }, 15000);
    return () => {
      active = false;
      clearTimeout(timer);
      loop?.stop();
      listener?.remove();
    };
  }, [opacity]);
  return (
    <View accessible accessibilityLabel={label} accessibilityState={{ busy: true }} style={s.gap}>
      <Animated.View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ opacity }}
      >
        <Placeholder kind={kind} />
      </Animated.View>
      {slow ? <Text style={s.hint}>Taking longer than usual. Check your connection.</Text> : null}
    </View>
  );
}
export function LoadingBoundary({
  loading,
  error,
  hasContent = false,
  kind,
  children,
}: {
  loading: boolean;
  error?: unknown;
  hasContent?: boolean;
  kind?: SkeletonKind;
  children: ReactNode;
}) {
  const pending = loading && !error && !hasContent;
  const wasPending = useRef(pending);
  const opacity = useRef(new Animated.Value(pending ? 0 : 1)).current;
  useEffect(() => {
    let active = true;
    let transition: Animated.CompositeAnimation | undefined;
    if (!pending && wasPending.current) {
      void Promise.resolve(AccessibilityInfo.isReduceMotionEnabled?.() ?? true)
        .then((reduced) => {
          if (!active) return;
          if (reduced) opacity.setValue(1);
          else {
            transition = Animated.timing(opacity, {
              toValue: 1,
              duration: 180,
              useNativeDriver: true,
              isInteraction: false,
            });
            transition.start();
          }
        })
        .catch(() => opacity.setValue(1));
    }
    wasPending.current = pending;
    return () => {
      active = false;
      transition?.stop();
    };
  }, [pending, opacity]);
  return pending ? (
    <Skeleton {...(kind ? { kind } : {})} />
  ) : (
    <Animated.View style={{ opacity, gap: spacing.md }}>{children}</Animated.View>
  );
}
const s = StyleSheet.create({
  gap: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  grow: { flex: 1, gap: spacing.sm },
  card: {
    ...mobileSurfaces.icyCard,
    backgroundColor: mobileSurfaces.icyCard.backgroundColor,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: mobileSurfaces.icyCard.borderColor,
    padding: spacing.lg,
    gap: spacing.md,
  },
  stat: {
    ...mobileSurfaces.glassEdge,
    borderWidth: 1,
    borderColor: mobileSurfaces.icyCard.borderColor,
    flex: 1,
    minHeight: spacing.touch * 2,
    backgroundColor: colors.icy,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  message: {
    width: '76%',
    backgroundColor: colors.icy,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  hint: { color: colors.secondary, fontSize: 14 },
});
