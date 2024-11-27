import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Plus, Trash2 } from 'lucide-react-native';
import type { VisitingWindow } from '@hsm/contracts';
import { mobileColors as c, mobileSurfaces } from '@hsm/ui';
import { TimeField } from './time-field';
type Slot = Pick<VisitingWindow, 'opensAt' | 'closesAt'>;
// VISIT-001: one weekday: open/closed switch and its own time slots (as many as needed).
export function VisitingDay(props: {
  name: string;
  slots: Slot[];
  disabled: boolean;
  onChange: (slots: Slot[]) => void;
  // Slots to start from when the day is switched on (the nearest open day's times).
  template: Slot[];
}) {
  const open = props.slots.length > 0;
  const change = (index: number, patch: Partial<Slot>) =>
    props.onChange(props.slots.map((slot, at) => (at === index ? { ...slot, ...patch } : slot)));
  return (
    <View style={[mobileSurfaces.icyCard, styles.card]} accessibilityLabel={props.name}>
      <View style={styles.head}>
        <Text className="font-heading" numberOfLines={1} style={styles.day}>
          {props.name}
        </Text>
        <Text className="font-body" style={[styles.state, open && { color: c.primary }]}>
          {open ? 'Open' : 'Closed'}
        </Text>
        <Switch
          accessibilityLabel={props.name + ' open for visits'}
          value={open}
          disabled={props.disabled}
          onValueChange={(on) => props.onChange(on ? props.template : [])}
          trackColor={{ true: c.primary, false: c.border }}
        />
      </View>
      {props.slots.map((slot, index) => (
        <View key={index} style={styles.slot}>
          <TimeField
            label={index ? 'From' : 'Opens'}
            value={slot.opensAt}
            disabled={props.disabled}
            onChange={(value) => change(index, { opensAt: value })}
          />
          <TimeField
            label={index ? 'To' : 'Closes'}
            value={slot.closesAt}
            disabled={props.disabled}
            onChange={(value) => change(index, { closesAt: value })}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={'Remove ' + props.name + ' slot ' + (index + 1)}
            disabled={props.disabled}
            onPress={() => props.onChange(props.slots.filter((_, at) => at !== index))}
            hitSlop={8}
            style={styles.icon}
          >
            <Trash2 color={c.dangerText} size={22} />
          </Pressable>
        </View>
      ))}
      {open ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={'Add a time slot on ' + props.name}
          disabled={props.disabled}
          onPress={() => {
            const last = props.slots.at(-1);
            props.onChange([
              ...props.slots,
              { opensAt: last?.closesAt ?? '16:00', closesAt: later(last?.closesAt ?? '16:00') },
            ]);
          }}
          style={styles.add}
        >
          <Plus color={c.primary} size={20} />
          <Text className="font-heading" style={styles.addText}>
            Add slot
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
// Two hours after a time, capped at 23:59, for a new slot that follows the last one.
function later(time: string) {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  const total = Math.min(hours * 60 + minutes + 120, 23 * 60 + 59);
  return (
    String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0')
  );
}
const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  day: { flex: 1, color: c.heading, fontSize: 17, fontWeight: '700' },
  state: { color: c.secondary, fontSize: 14 },
  slot: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  icon: { padding: 10 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  addText: { color: c.primary, fontSize: 15, fontWeight: '700' },
});
