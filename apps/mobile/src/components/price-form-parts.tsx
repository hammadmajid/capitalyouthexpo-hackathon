import { NumericTextInput as TextInput } from './grouped-number-input';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { Trash2, type LucideIcon } from 'lucide-react-native';
import { mobileColors as colors, mobileSurfaces } from '@hsm/ui';
import { FilterChip, IconChip } from './inventory-tools';
export type Fee = { code: string; cadence: string; amount: string };
type InputProps = { editable: boolean; className: string };
// One labelled card per part of the price: icon badge, title, optional one-line note.
export function PriceSection(props: {
  Icon: LucideIcon;
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <View
      style={mobileSurfaces.icyCard}
      className="gap-2 rounded-input border border-border p-3 frosted-card"
    >
      <View className="flex-row items-center gap-2">
        <View className="h-10 w-10 items-center justify-center rounded-pill bg-aqua">
          <props.Icon size={20} color={colors.primary} />
        </View>
        <View className="flex-1">
          <Text className="font-heading text-body text-heading">{props.title}</Text>
          {props.note ? (
            <Text className="font-body text-sm text-secondary">{props.note}</Text>
          ) : null}
        </View>
      </View>
      {props.children}
    </View>
  );
}
export function MoneyInput(props: {
  label: string;
  hint?: string;
  value: string;
  set: (value: string) => void;
  input: InputProps;
}) {
  return (
    <View className="gap-1">
      {props.hint ? <Text className="font-body text-sm text-secondary">{props.hint}</Text> : null}
      <View className="flex-row items-center gap-2">
        <Text className="font-heading text-body text-heading">Rs</Text>
        <TextInput
          accessibilityLabel={props.label}
          {...props.input}
          className={props.input.className + ' flex-1'}
          value={props.value}
          onChangeText={props.set}
          keyboardType="decimal-pad"
          maxLength={17}
        />
      </View>
    </View>
  );
}
const codes: [string, string][] = [
  ['mess', 'Mess'],
  ['utilities', 'Utilities'],
  ['admission', 'Admission'],
];
const cadences: [string, string][] = [
  ['monthly', 'Monthly'],
  ['one_time', 'One-time'],
];
// BKG-004: a disclosed fee is one of the allowed categories, charged monthly or once.
export function FeeRow(props: {
  index: number;
  fee: Fee;
  locked: boolean;
  input: InputProps;
  change: (patch: Partial<Fee>) => void;
  remove: () => void;
}) {
  const n = props.index + 1;
  return (
    <View className="gap-2 rounded-input border border-border p-2">
      <View className="flex-row flex-wrap gap-2">
        {codes.map(([value, text]) => (
          <FilterChip
            key={value}
            text={text}
            label={'Fee ' + n + ' type ' + text}
            selected={props.fee.code === value}
            onPress={() => !props.locked && props.change({ code: value })}
          />
        ))}
      </View>
      <View className="flex-row flex-wrap gap-2">
        {cadences.map(([value, text]) => (
          <FilterChip
            key={value}
            text={text}
            label={'Fee ' + n + ' ' + text}
            selected={props.fee.cadence === value}
            onPress={() => !props.locked && props.change({ cadence: value })}
          />
        ))}
      </View>
      <View className="flex-row items-center gap-2">
        <View className="flex-1">
          <MoneyInput
            label={'Fee ' + n + ' amount (Rs)'}
            value={props.fee.amount}
            set={(amount) => props.change({ amount })}
            input={props.input}
          />
        </View>
        <IconChip
          Icon={Trash2}
          label={'Remove fee ' + n}
          disabled={props.locked}
          onPress={props.remove}
        />
      </View>
    </View>
  );
}
