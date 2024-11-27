import { Text, View } from 'react-native';
import { mobileColors as c } from '@hsm/ui';
import { clock12, menuDays, menuMeals, type MenuView } from './menu-week';
// CHG-037: an optional preview of the full saved week.
export function MenuBoard({ menu }: { menu: MenuView }) {
  const cell = (day: number, meal: string) =>
    menu.items.find((item) => item.dayOfWeek === day && item.meal === meal)?.description;
  const time = (day: number, meal: string) =>
    (menu.times ?? []).find((t) => t.dayOfWeek === day && t.meal === meal);
  return (
    <View accessibilityLabel="Menu board" className="gap-2">
      <View style={{ flexDirection: 'row', paddingLeft: 44, gap: 6 }}>
        {menuMeals.map(({ key, label, Icon }) => (
          <View key={key} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon color={c.secondary} size={13} />
            <Text style={{ color: c.secondary, fontSize: 12 }}>{label}</Text>
          </View>
        ))}
      </View>
      {menuDays.map((name, index) => {
        const day = index + 1;
        return (
          <View
            key={name}
            style={{
              flexDirection: 'row',
              gap: 6,
              paddingTop: 8,
              borderTopWidth: 1,
              borderTopColor: c.border,
            }}
          >
            <Text style={{ width: 38, color: c.primary, fontWeight: '700' }}>{name}</Text>
            {menuMeals.map(({ key }) => {
              const served = time(day, key);
              return (
                <View key={key} style={{ flex: 1 }}>
                  <Text numberOfLines={2} style={{ color: c.heading, fontSize: 13 }}>
                    {cell(day, key) ?? '—'}
                  </Text>
                  {served ? (
                    <Text style={{ color: c.secondary, fontSize: 11 }}>
                      {clock12(served.startsAt)}–{clock12(served.endsAt)}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}
