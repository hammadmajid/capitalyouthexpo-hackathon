import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, Layers3, Plus, type LucideIcon } from 'lucide-react-native';
import { mobileColors, mobileOwnerColors as c, ownerMetrics as m, mobileSurfaces } from '@hsm/ui';
import type { PropertyFloor } from '@hsm/contracts';

// Level 0 reads as the ground floor; other levels by number.
export function floorName(level: number) {
  return level === 0 ? 'Ground' : 'Floor ' + level;
}
// One card row, same look as the building and room cards. The frame sits on a plain
// View because Pressable style callbacks are not applied on device here.
export function CardRow({
  Icon,
  title,
  detail,
  label,
  onPress,
  disabled = false,
}: {
  Icon: LucideIcon;
  title: string;
  detail?: string | undefined;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => (pressed ? styles.pressed : disabled ? styles.disabled : undefined)}
    >
      <View style={styles.card}>
        <View style={styles.badge}>
          <Icon size={30} color={c.primary} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text className="font-heading" style={styles.title}>
            {title}
          </Text>
          {detail ? <Text style={styles.detail}>{detail}</Text> : null}
        </View>
        <ChevronRight size={28} color={c.primary} />
      </View>
    </Pressable>
  );
}
// BRN-001: floors of a building as cards; each opens its own floor screen.
export function OwnerFloorGrid({
  floors,
  open,
  add,
  detail,
  busy = false,
  action,
}: {
  action?: ((floor: PropertyFloor) => ReactNode) | undefined;
  floors: PropertyFloor[];
  open: (floor: PropertyFloor) => void;
  add?: (() => void) | undefined;
  detail?: ((floor: PropertyFloor) => string) | undefined;
  busy?: boolean;
}) {
  return (
    <View style={{ gap: m.smallGap }}>
      {floors.map((floor) => (
        <View key={floor.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ flex: 1 }}>
            <CardRow
              Icon={Layers3}
              title={floor.label.trim() || floorName(floor.levelNumber)}
              detail={detail?.(floor)}
              label={'Open floor ' + floor.levelNumber}
              onPress={() => open(floor)}
            />
          </View>
          {action?.(floor)}
        </View>
      ))}
      {add ? (
        <CardRow Icon={Plus} title="Add floor" label="Add floor" disabled={busy} onPress={add} />
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    ...mobileSurfaces.icyCard,
    borderWidth: 1,
    borderRadius: m.cardRadius,
    padding: m.gap,
    flexDirection: 'row',
    alignItems: 'center',
    gap: m.smallGap,
    minHeight: m.touch,
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mobileColors.aqua,
  },
  title: { color: c.heading, fontSize: m.title - 4, fontWeight: '700' },
  detail: { color: c.secondary, fontSize: m.body },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.45 },
});
