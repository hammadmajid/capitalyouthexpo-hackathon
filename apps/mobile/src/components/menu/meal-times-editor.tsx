import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Clock } from 'lucide-react-native';
import { mobileColors as c, mobileSurfaces } from '@hsm/ui';
import { ClockPicker } from './clock-picker';
import { clock12, menuDayNames, menuMeals } from './menu-week';
// CHG-037: times belong to the chosen day, so Mon–Fri and the weekend can differ. Keys are
// "time:<day>:<meal>:from|to" in the menu draft.
export type Draft = Record<string, string>;
export const timeKey = (day: number, meal: string, edge: 'from' | 'to') =>
  'time:' + day + ':' + meal + ':' + edge;
const groups: [string, number[]][] = [
  ['Mon–Fri', [1, 2, 3, 4, 5]],
  ['Sat', [6]],
  ['Sun', [7]],
];
export function MealTimesEditor(props: {
  day: number;
  draft: Draft;
  change: (next: Draft) => void;
  disabled: boolean;
  showTimes?: boolean;
  renderMeal?: (meal: (typeof menuMeals)[number]) => ReactNode;
}) {
  const [open, setOpen] = useState<{ meal: string; label: string; edge: 'from' | 'to' }>();
  const showTimes = props.showTimes ?? true;
  const value = (meal: string, edge: 'from' | 'to') => props.draft[timeKey(props.day, meal, edge)];
  const copyTo = (days: number[]) =>
    props.change({
      ...props.draft,
      ...Object.fromEntries(
        days.flatMap((d) =>
          menuMeals.flatMap(({ key }) =>
            (['from', 'to'] as const).map((edge) => [
              timeKey(d, key, edge),
              value(key, edge) ?? '',
            ]),
          ),
        ),
      ),
    });
  const hasTimes = menuMeals.some(({ key }) => value(key, 'from') || value(key, 'to'));
  return (
    <View className="gap-3">
      {!props.renderMeal ? (
        <Text style={{ color: c.heading, fontSize: 15, fontWeight: '700' }}>
          Serving times for {menuDayNames[props.day - 1]}
        </Text>
      ) : null}
      {menuMeals.map((meal) => {
        const { key, label, Icon } = meal;
        return (
          <View key={key} className="gap-1">
            {props.renderMeal ? (
              props.renderMeal(meal)
            ) : (
              <View className="flex-row items-center gap-2">
                <Icon color={c.primary} size={18} />
                <Text className="font-heading text-sm text-heading">
                  {key === 'lunch' ? label + ' (optional)' : label}
                </Text>
              </View>
            )}
            {showTimes ? (
              <View className="flex-row gap-2">
                {(['from', 'to'] as const).map((edge) => (
                  <View key={edge} className="flex-1 gap-1">
                    <Text className="font-body text-xs text-secondary">
                      {edge === 'from' ? 'Starts at' : 'Ends at'}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={label + (edge === 'from' ? ' starts' : ' ends')}
                      disabled={props.disabled}
                      onPress={() => setOpen({ meal: key, label, edge })}
                      style={{
                        flex: 1,
                        minHeight: 46,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: mobileSurfaces.icyCard.borderColor,
                        backgroundColor: c.inputSurface,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                      }}
                    >
                      <Clock color={c.secondary} size={14} />
                      <Text style={{ color: value(key, edge) ? c.heading : c.secondary }}>
                        {value(key, edge) ? clock12(value(key, edge) ?? '') : 'Set time'}
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
      {showTimes && hasTimes ? (
        <View className="flex-row flex-wrap items-center gap-x-2">
          <Text className="font-body text-xs text-secondary">Copy times to</Text>
          {groups.map(([name, days]) => (
            <Pressable
              key={name}
              accessibilityRole="button"
              accessibilityLabel={name}
              disabled={props.disabled}
              onPress={() => copyTo(days)}
              className="min-h-11 justify-center px-2"
            >
              <Text className="font-heading text-sm text-primary">{name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <ClockPicker
        visible={Boolean(open)}
        title={open ? open.label + (open.edge === 'from' ? ' starts' : ' ends') : ''}
        value={open ? value(open.meal, open.edge) : undefined}
        onClose={() => setOpen(undefined)}
        onPick={(time) => {
          if (open)
            props.change({ ...props.draft, [timeKey(props.day, open.meal, open.edge)]: time });
        }}
      />
    </View>
  );
}
