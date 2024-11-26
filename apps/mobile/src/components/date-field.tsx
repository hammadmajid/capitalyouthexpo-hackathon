import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { CalendarDays } from 'lucide-react-native';
import { mobileColors as c, mobileSurfaces } from '@hsm/ui';
// One date control for the whole app: tap, flick the day/month/year wheels, Set. Values stay
// "YYYY-MM-DD" (or "YYYY-MM-01" for months) so every API contract is unchanged.
const ROW = 46,
  VISIBLE = 5;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const todayInKarachi = () => new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const pad = (value: number) => String(value).padStart(2, '0');
function parts(value: string | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  const today = todayInKarachi();
  const [y, m, d] = (match ? [match[1], match[2], match[3]] : today.split('-')).map(Number);
  return { year: y ?? 2026, month: m ?? 1, day: d ?? 1 };
}
export function formatDate(value: string, monthOnly = false) {
  const { year, month, day } = parts(value);
  return (monthOnly ? '' : day + ' ') + MONTHS[month - 1] + ' ' + year;
}
export function DateField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  optional?: boolean;
  monthOnly?: boolean;
  minYear?: number;
  maxYear?: number;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const filled = /^\d{4}-\d{2}-\d{2}$/.test(props.value);
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: c.secondary, fontSize: 13 }}>{props.label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          props.label + ': ' + (filled ? formatDate(props.value, props.monthOnly) : 'not set')
        }
        accessibilityState={{ disabled: Boolean(props.disabled) }}
        disabled={props.disabled}
        onPress={() => setOpen(true)}
        style={{
          minHeight: 50,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 14,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: mobileSurfaces.icyCard.borderColor,
          backgroundColor: c.inputSurface,
          opacity: props.disabled ? 0.55 : 1,
        }}
      >
        <CalendarDays color={c.primary} size={20} />
        <Text
          style={{
            flex: 1,
            color: filled ? c.heading : c.placeholder,
            fontSize: 15,
            fontWeight: filled ? '600' : '400',
          }}
        >
          {filled ? formatDate(props.value, props.monthOnly) : (props.placeholder ?? 'Choose date')}
        </Text>
        {filled && props.optional ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={'Clear ' + props.label}
            hitSlop={8}
            onPress={() => props.onChange('')}
          >
            <Text style={{ color: c.primary, fontWeight: '600' }}>Clear</Text>
          </Pressable>
        ) : null}
      </Pressable>
      {open ? (
        <DateSheet
          title={props.label}
          value={props.value}
          monthOnly={props.monthOnly ?? false}
          minYear={props.minYear ?? new Date().getFullYear() - 3}
          maxYear={props.maxYear ?? new Date().getFullYear() + 3}
          close={() => setOpen(false)}
          pick={(next) => {
            props.onChange(next);
            setOpen(false);
          }}
        />
      ) : null}
    </View>
  );
}
function DateSheet(props: {
  title: string;
  value: string;
  monthOnly: boolean;
  minYear: number;
  maxYear: number;
  close: () => void;
  pick: (value: string) => void;
}) {
  const start = parts(props.value);
  const [year, setYear] = useState(Math.min(Math.max(start.year, props.minYear), props.maxYear));
  const [month, setMonth] = useState(start.month);
  const [day, setDay] = useState(start.day);
  const [jump, setJump] = useState(0);
  const sheet = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(sheet, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
  }, [sheet]);
  const maxDay = daysIn(year, month);
  const shownDay = Math.min(day, maxDay);
  const years = Array.from(
    { length: props.maxYear - props.minYear + 1 },
    (_, i) => props.minYear + i,
  );
  const today = () => {
    const now = parts(todayInKarachi());
    setYear(now.year);
    setMonth(now.month);
    setDay(now.day);
    setJump((value) => value + 1);
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={props.close}>
      <Pressable
        accessibilityLabel="Close date picker"
        onPress={props.close}
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,40,30,0.35)' }}
      >
        <Animated.View
          onStartShouldSetResponder={() => true}
          style={{
            ...mobileSurfaces.icyCard,
            borderWidth: 1,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            padding: 20,
            gap: 14,
            transform: [
              { translateY: sheet.interpolate({ inputRange: [0, 1], outputRange: [420, 0] }) },
            ],
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, color: c.heading, fontSize: 17, fontWeight: '700' }}>
              {props.title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Today"
              onPress={today}
              hitSlop={8}
            >
              <Text style={{ color: c.primary, fontWeight: '700' }}>Today</Text>
            </Pressable>
          </View>
          <Text style={{ color: c.deep, fontSize: 26, fontWeight: '700', textAlign: 'center' }}>
            {(props.monthOnly ? '' : shownDay + ' ') + MONTHS[month - 1] + ' ' + year}
          </Text>
          <View style={{ flexDirection: 'row', height: ROW * VISIBLE }}>
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: ROW * 2,
                height: ROW,
                borderRadius: 14,
                backgroundColor: c.aqua,
              }}
            />
            {props.monthOnly ? null : (
              <Wheel
                key={'d' + jump + maxDay}
                label="Day"
                items={Array.from({ length: maxDay }, (_, i) => String(i + 1))}
                index={shownDay - 1}
                onIndex={(i) => setDay(i + 1)}
              />
            )}
            <Wheel
              key={'m' + jump}
              label="Month"
              items={MONTHS}
              index={month - 1}
              onIndex={(i) => setMonth(i + 1)}
              flex={1.3}
            />
            <Wheel
              key={'y' + jump}
              label="Year"
              items={years.map(String)}
              index={years.indexOf(year)}
              onIndex={(i) => setYear(years[i] ?? year)}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <SheetButton label="Cancel" onPress={props.close} />
            <SheetButton
              solid
              label="Set date"
              onPress={() =>
                props.pick(year + '-' + pad(month) + '-' + (props.monthOnly ? '01' : pad(shownDay)))
              }
            />
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
// A snapping wheel: rows fade and shrink as they leave the centre band.
function Wheel(props: {
  label: string;
  items: string[];
  index: number;
  onIndex: (index: number) => void;
  flex?: number;
}) {
  const scroll = useRef(new Animated.Value(Math.max(props.index, 0) * ROW)).current;
  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.y / ROW);
    props.onIndex(Math.min(Math.max(index, 0), props.items.length - 1));
  };
  return (
    <Animated.ScrollView
      accessibilityLabel={props.label}
      style={{ flex: props.flex ?? 1 }}
      showsVerticalScrollIndicator={false}
      snapToInterval={ROW}
      decelerationRate="fast"
      contentOffset={{ x: 0, y: Math.max(props.index, 0) * ROW }}
      contentContainerStyle={{ paddingVertical: ROW * 2 }}
      onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scroll } } }], {
        useNativeDriver: true,
      })}
      scrollEventThrottle={16}
      onMomentumScrollEnd={settle}
      onScrollEndDrag={(event) => {
        if (!event.nativeEvent.velocity?.y) settle(event);
      }}
    >
      {props.items.map((item, index) => {
        const range = [(index - 2) * ROW, index * ROW, (index + 2) * ROW];
        return (
          <Pressable
            key={item + index}
            accessibilityRole="button"
            accessibilityLabel={props.label + ' ' + item}
            onPress={() => props.onIndex(index)}
            style={{ height: ROW, justifyContent: 'center', alignItems: 'center' }}
          >
            <Animated.Text
              style={{
                fontSize: 19,
                fontWeight: '700',
                color: c.heading,
                opacity: scroll.interpolate({
                  inputRange: range,
                  outputRange: [0.25, 1, 0.25],
                  extrapolate: 'clamp',
                }),
                transform: [
                  {
                    scale: scroll.interpolate({
                      inputRange: range,
                      outputRange: [0.8, 1.1, 0.8],
                      extrapolate: 'clamp',
                    }),
                  },
                ],
              }}
            >
              {item}
            </Animated.Text>
          </Pressable>
        );
      })}
    </Animated.ScrollView>
  );
}
function SheetButton(props: { label: string; solid?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      onPress={props.onPress}
      style={{
        flex: 1,
        minHeight: 52,
        borderRadius: 26,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: props.solid ? 0 : 1,
        borderColor: mobileSurfaces.icyCard.borderColor,
        backgroundColor: props.solid ? c.deep : c.surface,
      }}
    >
      <Text style={{ color: props.solid ? c.surface : c.primary, fontWeight: '700' }}>
        {props.label}
      </Text>
    </Pressable>
  );
}
