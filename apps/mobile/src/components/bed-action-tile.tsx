import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { mobileColors, mobileOwnerColors as c, ownerMetrics as m, mobileSurfaces } from '@hsm/ui';
// Half-width action tile: icon badge, short title, one muted detail line.
// The frame sits on a plain View (Pressable style callbacks are not applied on device).
export function BedActionTile(props: {
  Icon: LucideIcon;
  title: string;
  detail?: string | undefined;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const disabled = props.disabled ?? false;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={props.onPress}
      style={{ flexBasis: '47%', flexGrow: 1, opacity: disabled ? 0.55 : 1 }}
    >
      <View style={styles.tile}>
        <View style={styles.badge}>
          <props.Icon size={26} color={c.primary} />
        </View>
        <Text className="font-heading" style={styles.title}>
          {props.title}
        </Text>
        {props.detail ? (
          <Text numberOfLines={2} style={styles.detail}>
            {props.detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  tile: {
    ...mobileSurfaces.icyCard,
    borderWidth: 1,
    borderRadius: m.cardRadius,
    padding: m.gap,
    alignItems: 'center',
    gap: 6,
    minHeight: 132,
    justifyContent: 'center',
  },
  badge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mobileColors.aqua,
  },
  title: {
    alignSelf: 'stretch',
    color: c.heading,
    fontSize: m.body,
    fontWeight: '700',
    textAlign: 'center',
  },
  detail: { alignSelf: 'stretch', color: c.secondary, fontSize: m.small, textAlign: 'center' },
});
