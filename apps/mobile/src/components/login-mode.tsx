import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Mail, Phone } from 'lucide-react-native';
import { icons, natureLoginColors as c, natureLoginMetrics as m } from '@hsm/ui';
export type LoginMode = 'email' | 'phone';
export function LoginModePicker({
  mode,
  select,
  disabled,
}: {
  mode: LoginMode;
  select: (mode: LoginMode) => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.tabs}>
      {(['email', 'phone'] as const).map((option) => {
        const selected = option === mode;
        const Icon = option === 'email' ? Mail : Phone;
        const color = selected ? c.heading : c.secondary;
        return (
          <Pressable
            key={option}
            accessibilityRole="tab"
            accessibilityLabel={option === 'email' ? 'Email' : 'Phone'}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => select(option)}
            android_ripple={{ color: c.divider }}
            style={[styles.tab, selected && styles.selected]}
          >
            <View style={styles.tabContent}>
              <Icon
                accessible={false}
                size={m.iconSize}
                color={color}
                strokeWidth={icons.strokeWidth}
              />
              <Text style={[styles.label, { color }]}>
                {option === 'email' ? 'Email' : 'Phone'}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    borderRadius: m.inputRadius,
    borderWidth: 1,
    borderColor: c.glassHighlight,
    backgroundColor: c.selector,
    padding: m.xs / 2,
  },
  tab: {
    flex: 1,
    minHeight: m.selectorHeight - m.xs,
    borderRadius: m.inputRadius - m.xs / 2,
    alignItems: 'center',
    justifyContent: 'center',
    padding: m.sm,
  },
  tabContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: m.sm,
  },
  selected: {
    backgroundColor: c.selected,
    boxShadow: [{ offsetX: 0, offsetY: 3, blurRadius: 7, color: c.shadow }],
  },
  label: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: m.controlSize,
    includeFontPadding: false,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
});
