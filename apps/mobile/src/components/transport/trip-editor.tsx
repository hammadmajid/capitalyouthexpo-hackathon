import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { ArrowLeft, ArrowRight, Plus, Trash2 } from 'lucide-react-native';
import type { TransportTrip } from '@hsm/contracts';
import { mobileColors as c, mobileOwnerColors, mobileSurfaces } from '@hsm/ui';
import { TimeField } from '../time-field';
import { todayInKarachi } from '../date-field';
import { dayShort } from './transport-ui';
function newTrip(days: number[] = []): TransportTrip {
  return {
    days,
    outboundDeparts: '',
    outboundArrives: null,
    outboundArrivesNextDay: false,
    returnDeparts: null,
    returnDepartsNextDay: false,
    returnArrives: null,
    returnArrivesNextDay: false,
    effectiveFrom: todayInKarachi(),
    active: true,
  };
}
// CHG-042 / CHG-048: each timing is a set of days with just two times: when the van leaves
// the hostel, and (optional) when it leaves the destination to come back. Different days get
// different times by adding another timing. Arrival times are not asked; a return earlier
// than the departure is after midnight. Changing a time clears any old arrival times so the
// saved order always matches what the owner sees.
export function TripEditor(props: {
  value: TransportTrip[];
  onChange: (value: TransportTrip[]) => void;
  disabled?: boolean;
}) {
  const disabled = Boolean(props.disabled);
  const set = (index: number, patch: Partial<TransportTrip>) =>
    props.onChange(props.value.map((trip, at) => (at === index ? { ...trip, ...patch } : trip)));
  // Days already used by another timing: offered first to the next timing is the rest.
  const used = new Set(props.value.flatMap((trip) => trip.days));
  const times = (
    trip: TransportTrip,
    out: string,
    back: string | null,
  ): Partial<TransportTrip> => ({
    outboundDeparts: out,
    outboundArrives: null,
    outboundArrivesNextDay: false,
    returnDeparts: back,
    returnDepartsNextDay: Boolean(back && out && back <= out),
    returnArrives: null,
    returnArrivesNextDay: false,
    ...(trip.effectiveFrom ? {} : { effectiveFrom: todayInKarachi() }),
  });
  return (
    <View style={{ gap: 12 }}>
      {props.value.map((trip, index) => (
        <View
          key={index}
          accessibilityLabel={'Timing ' + (index + 1)}
          style={[mobileSurfaces.icyCard, styles.card, !trip.active && { opacity: 0.6 }]}
        >
          <View style={styles.head}>
            <View style={styles.days}>
              {dayShort.map((name, at) => {
                const day = at + 1,
                  on = trip.days.includes(day);
                return (
                  <Pressable
                    key={name}
                    accessibilityRole="button"
                    accessibilityLabel={name + ', timing ' + (index + 1)}
                    accessibilityState={{ selected: on, disabled }}
                    disabled={disabled}
                    onPress={() =>
                      set(index, {
                        days: on
                          ? trip.days.filter((value) => value !== day)
                          : [...trip.days, day].sort((a, b) => a - b),
                      })
                    }
                    style={[styles.day, on && styles.dayOn]}
                  >
                    <Text style={[styles.dayText, on && { color: mobileOwnerColors.onPrimary }]}>
                      {name.slice(0, 2)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={styles.row}>
            <ArrowRight color={c.primary} size={20} />
            <TimeField
              label="Leaves hostel"
              value={trip.outboundDeparts}
              disabled={disabled}
              onChange={(value) => set(index, times(trip, value ?? '', trip.returnDeparts))}
            />
          </View>
          <View style={styles.row}>
            <ArrowLeft color={c.primary} size={20} />
            <TimeField
              label="Back pickup (optional)"
              value={trip.returnDeparts ?? ''}
              disabled={disabled}
              onChange={(value) => set(index, times(trip, trip.outboundDeparts, value || null))}
            />
          </View>
          <View style={styles.foot}>
            <Switch
              accessibilityLabel={'Timing ' + (index + 1) + ' running'}
              value={trip.active}
              disabled={disabled}
              onValueChange={(active) => set(index, { active })}
              trackColor={{ true: c.primary, false: c.border }}
            />
            <Text className="font-body" numberOfLines={1} style={styles.state}>
              {trip.active ? 'Running' : 'Paused'}
            </Text>
            <View style={{ flex: 1 }} />
            {trip.returnDeparts ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={'One way, timing ' + (index + 1)}
                disabled={disabled}
                onPress={() => set(index, times(trip, trip.outboundDeparts, null))}
                hitSlop={8}
              >
                <Text style={styles.link}>One way</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={'Remove timing ' + (index + 1)}
              disabled={disabled}
              onPress={() => props.onChange(props.value.filter((_, at) => at !== index))}
              hitSlop={8}
              style={{ padding: 6 }}
            >
              <Trash2 color={c.dangerText} size={20} />
            </Pressable>
          </View>
        </View>
      ))}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={props.value.length ? 'Other days' : 'Add timing'}
        disabled={disabled || props.value.length >= 24}
        onPress={() =>
          props.onChange([
            ...props.value,
            // The first timing covers every day; later ones start with the days still free.
            newTrip(
              props.value.length
                ? [1, 2, 3, 4, 5, 6, 7].filter((day) => !used.has(day))
                : [1, 2, 3, 4, 5, 6, 7],
            ),
          ])
        }
        style={styles.add}
      >
        <Plus color={c.primary} size={20} />
        <Text style={styles.addText}>{props.value.length ? 'Other days' : 'Add timing'}</Text>
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 10 },
  head: { gap: 6 },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  day: {
    minWidth: 38,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
  },
  dayOn: { borderColor: c.primary, backgroundColor: c.primary },
  dayText: { color: c.text, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  state: { color: c.secondary, fontSize: 13, flexShrink: 0, paddingRight: 2 },
  link: { color: c.primary, fontWeight: '700', fontSize: 13 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  addText: { color: c.primary, fontWeight: '700' },
});
