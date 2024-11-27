import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Clock } from 'lucide-react-native';
import { mobileColors as c, mobileSurfaces } from '@hsm/ui';
import { ClockPicker } from './menu/clock-picker';
// "14:30" → "2:30 PM". Values stay 24-hour "HH:MM" so API contracts are unchanged.
export function formatTime(value: string) {
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return value;
  const hour = Number(match[1]);
  return String(hour % 12 || 12) + ':' + match[2] + (hour >= 12 ? ' PM' : ' AM');
}
// Tap to open the animated clock. Shared by visiting hours and visit times.
export function TimeField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const filled = /^\d{2}:\d{2}$/.test(props.value);
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={{ color: c.secondary, fontSize: 12 }}>{props.label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={props.label + ': ' + (filled ? formatTime(props.value) : 'not set')}
        accessibilityState={{ disabled: Boolean(props.disabled) }}
        disabled={props.disabled}
        onPress={() => setOpen(true)}
        style={[
          mobileSurfaces.icyCard,
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            borderWidth: 1,
            borderRadius: 14,
            paddingHorizontal: 12,
            paddingVertical: 12,
            opacity: props.disabled ? 0.5 : 1,
          },
        ]}
      >
        <Clock color={c.primary} size={18} />
        <Text style={{ color: filled ? c.heading : c.secondary, fontWeight: '600' }}>
          {filled ? formatTime(props.value) : 'Set time'}
        </Text>
      </Pressable>
      <ClockPicker
        visible={open}
        title={props.label}
        value={filled ? props.value : undefined}
        onClose={() => setOpen(false)}
        onPick={(value) => {
          props.onChange(value);
          setOpen(false);
        }}
      />
    </View>
  );
}
