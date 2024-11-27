import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Coffee, Moon, Sun, type LucideIcon } from 'lucide-react-native';
import type { BranchMenu } from '@hsm/contracts';
import { mobileColors as c, mobileSurfaces } from '@hsm/ui';
// SERV-001: one weekly menu; day 1 is Monday. Shared by the Owner editor and the guest view.
export const menuDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const menuDayNames = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;
export const menuMeals: {
  key: 'breakfast' | 'lunch' | 'dinner';
  label: string;
  Icon: LucideIcon;
}[] = [
  { key: 'breakfast', label: 'Breakfast', Icon: Coffee },
  { key: 'lunch', label: 'Lunch', Icon: Sun },
  { key: 'dinner', label: 'Dinner', Icon: Moon },
];
// "19:30" reads as "7:30 PM" for guests.
export function clock12(value: string) {
  const [hour = 0, minute = 0] = value.split(':').map(Number);
  const suffix = hour < 12 ? 'AM' : 'PM';
  return ((hour + 11) % 12) + 1 + ':' + String(minute).padStart(2, '0') + ' ' + suffix;
}
// Today in Pakistan as 1 (Monday) … 7 (Sunday).
export function todayMenuDay() {
  const name = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'Asia/Karachi' })
    .format(new Date())
    .slice(0, 3);
  const index = menuDays.indexOf(name as (typeof menuDays)[number]);
  return index < 0 ? 1 : index + 1;
}
export function DayChips(props: {
  day: number;
  setDay: (day: number) => void;
  filled?: (day: number) => boolean;
  wrap?: boolean;
}) {
  const choices = menuDays.map((name, index) => {
    const day = index + 1;
    const on = props.day === day;
    return (
      <Pressable
        key={name}
        accessibilityRole="button"
        accessibilityLabel={name}
        accessibilityState={{ selected: on }}
        onPress={() => props.setDay(day)}
        style={{
          minWidth: 48,
          minHeight: 44,
          ...(props.wrap ? { flexBasis: '22%', flexGrow: 1 } : {}),
          paddingHorizontal: 12,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: on ? c.deep : mobileSurfaces.icyCard.borderColor,
          backgroundColor: on ? c.deep : c.surface,
        }}
      >
        <Text style={{ color: on ? c.surface : c.primary, fontWeight: '700' }}>{name}</Text>
        {props.filled ? (
          <View
            style={{
              width: 5,
              height: 5,
              borderRadius: 3,
              marginTop: 2,
              backgroundColor: props.filled(day) ? (on ? c.surface : c.primary) : 'transparent',
            }}
          />
        ) : null}
      </Pressable>
    );
  });
  if (props.wrap)
    return (
      <View accessibilityLabel="Menu days" className="flex-row flex-wrap gap-2">
        {choices}
      </View>
    );
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8 }}
      accessibilityLabel="Menu days"
    >
      {choices}
    </ScrollView>
  );
}
export function MealLine(props: { Icon: LucideIcon; label: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: c.aqua,
        }}
      >
        <props.Icon color={c.primary} size={18} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.secondary, fontSize: 12 }}>{props.label}</Text>
        <Text style={{ color: c.heading, fontSize: 15, fontWeight: '600' }}>{props.text}</Text>
      </View>
    </View>
  );
}
// Responses from older servers may not carry times yet.
export type MenuView = {
  items: BranchMenu['items'];
  times?: BranchMenu['times'] | undefined;
};
// Read-only week: pick a day, see its three meals.
export function MenuWeek({ menu }: { menu: MenuView }) {
  const [day, setDay] = useState(todayMenuDay);
  const meal = (key: string) =>
    menu.items.find((item) => item.dayOfWeek === day && item.meal === key)?.description;
  return (
    <View style={{ gap: 12 }} accessibilityLabel="Weekly menu">
      <DayChips
        day={day}
        setDay={setDay}
        filled={(d) => menu.items.some((item) => item.dayOfWeek === d)}
      />
      {menuMeals.map(({ key, label, Icon }) => {
        const time = (menu.times ?? []).find((t) => t.dayOfWeek === day && t.meal === key);
        // Lunch is optional; a day without it shows no empty lunch line.
        if (key === 'lunch' && !meal(key) && !time) return null;
        return (
          <MealLine
            key={key}
            Icon={Icon}
            label={
              time ? label + ' · ' + clock12(time.startsAt) + '–' + clock12(time.endsAt) : label
            }
            text={meal(key) ?? '—'}
          />
        );
      })}
    </View>
  );
}
