import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { mobileOwnerColors as c, mobileSurfaces, ownerMetrics as m } from '@hsm/ui';
// CHG-048: the branch's other daily tools (Rent board, proofs, room types, occupancy by
// date) as one compact row under the Bed Board, so the board stays the first thing seen.
export function BoardTools(props: {
  tools: { key: string; label: string; short: string; Icon: LucideIcon }[];
  onOpen: (key: string) => void;
  disabled?: boolean;
}) {
  if (!props.tools.length) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel="More rooms and rent tools"
      contentContainerStyle={styles.row}
    >
      {props.tools.map(({ key, label, short, Icon }) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled: Boolean(props.disabled) }}
          disabled={props.disabled}
          onPress={() => props.onOpen(key)}
          style={({ pressed }) =>
            pressed || props.disabled ? { opacity: props.disabled ? 0.5 : 0.7 } : undefined
          }
        >
          <View style={styles.chip}>
            <Icon size={22} color={c.primary} />
            <Text className="font-heading" numberOfLines={1} style={styles.text}>
              {short}
            </Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 2 },
  chip: {
    ...mobileSurfaces.icyCard,
    minHeight: m.touch - 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
  },
  text: { color: c.primary, fontSize: m.body, fontWeight: '700' },
});
