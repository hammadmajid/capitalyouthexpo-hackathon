import { NumericTextInput as TextInput } from './grouped-number-input';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  AlarmClock,
  Calculator,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  Clock,
  Infinity as InfinityIcon,
  Receipt,
  Settings2,
  type LucideIcon,
} from 'lucide-react-native';
import { groupNumberInput, mobileColors as colors } from '@hsm/ui';
import { billingPolicyFields, billingDraftFrom, type BillingDraft } from '@hsm/api-client';
import type { BillingPolicy } from '@hsm/contracts';
import { Button, Copy } from './ui';
// Technical detail (rounding, fee timing, early-leave maths) stays on the policy screen;
// an agreement shows only what a resident and owner act on.
const detailOnly = /rounding|custom charge|fee timing|early checkout|rent cycle|fee due offset/i;
export function NativeBillingPolicySummary({
  policy,
  compact = false,
}: {
  policy: BillingPolicy;
  compact?: boolean;
}) {
  const draft = billingDraftFrom(policy);
  const fields = shownFields(draft).filter((field) => !compact || !detailOnly.test(field.label));
  return (
    <View className="flex-row flex-wrap gap-2">
      {fields.map((field) => (
        <View
          key={field.name}
          style={{ flexBasis: '47%', flexGrow: 1 }}
          className="gap-1 rounded-input border border-border bg-icy p-3"
        >
          <Text className="font-body text-xs text-secondary">
            {compact ? short(field.label) : field.label}
          </Text>
          <Text className="font-heading text-sm text-heading">
            {compact
              ? plain(field, draft)
              : field.choices
                ? field.choices.find(([value]) => value === draft[field.name])?.[1]
                : (field.amount ? 'Rs ' : '') + groupNumberInput(draft[field.name])}
          </Text>
        </View>
      ))}
    </View>
  );
}
type Field = ReturnType<typeof billingPolicyFields>[number];
// Rounding only decides how a fraction of a paisa is rounded (under PKR 0.01), so owners are
// not asked; the saved choice (normally "nearest") is kept unchanged on every save.
const hidden: readonly string[] = ['prorationRounding', 'checkoutRounding', 'monthlyFeeRounding'];
function shownFields(draft: BillingDraft) {
  return billingPolicyFields(draft).filter((field) => !hidden.includes(field.name));
}
// Compact values read as plain words: "1st", "5 days", "None".
function plain(field: Field, draft: BillingDraft) {
  const raw = String(draft[field.name]);
  if (field.choices) {
    const text = field.choices.find(([value]) => value === raw)?.[1] ?? raw;
    return text === 'Disabled' ? 'None' : text;
  }
  if (field.amount) return 'Rs ' + groupNumberInput(raw);
  if (/due day/i.test(field.label)) return ordinal(Number(raw));
  if (/days/i.test(field.label)) return raw + (raw === '1' ? ' day' : ' days');
  return raw;
}
function ordinal(day: number) {
  const teen = day % 100 >= 11 && day % 100 <= 13;
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[day % 10];
  return day + (suffix ?? 'th');
}
// Short visible names; the full label stays the accessible name of each control.
function short(label: string) {
  return label
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/^Rent proration rounding$/, 'Partial-month rounding')
    .replace(/^Rent proration$/, 'Partial month')
    .replace(/^Early checkout adjustment rounding$/, 'Early-leave rounding')
    .replace(/^Early checkout adjustment$/, 'Early leave')
    .replace(/^Allow open-ended stays$/, 'Open-ended stays')
    .replace(/ policy$/, '')
    .replace(/^Disclosed fee timing$/, 'Fee timing');
}
const icons: [RegExp, LucideIcon][] = [
  [/rounding/i, Calculator],
  [/proration|early/i, CalendarRange],
  [/due day|cycle|period length/i, CalendarDays],
  [/grace|notice|offset/i, Clock],
  [/late/i, AlarmClock],
  [/open-ended/i, InfinityIcon],
  [/charge|fee/i, Receipt],
];
function FieldIcon({ label }: { label: string }) {
  const Icon = icons.find(([pattern]) => pattern.test(label))?.[1] ?? Settings2;
  return <Icon size={18} color={colors.primary} />;
}
export function NativeBillingPolicyForm({
  draft,
  change,
  disabled,
  save,
  cancel,
  error,
}: {
  draft: BillingDraft;
  change: (draft: BillingDraft) => void;
  disabled: boolean;
  save: () => void;
  cancel: () => void;
  error: string;
}) {
  const [expanded, setExpanded] = useState<keyof BillingDraft>();
  return (
    <View className="gap-4">
      {/* RENT-001: a new version applies to future agreements; signed terms never change. */}
      <Copy>Saves a new version · signed agreements unchanged</Copy>
      {shownFields(draft).map((field) => (
        <View key={field.name} className="gap-2">
          {field.choices ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  field.label +
                  ': ' +
                  (field.choices.find(([value]) => value === draft[field.name])?.[1] ??
                    'Choose a setting')
                }
                accessibilityState={{ disabled, expanded: expanded === field.name }}
                disabled={disabled}
                onPress={() => setExpanded(expanded === field.name ? undefined : field.name)}
                className="min-h-12 flex-row items-center gap-2 rounded-input border border-border bg-icy px-3 py-2"
              >
                <FieldIcon label={field.label} />
                <Text className="flex-1 font-body text-sm text-secondary">
                  {short(field.label)}
                </Text>
                <Text className="font-heading text-sm text-heading">
                  {field.choices.find(([value]) => value === draft[field.name])?.[1] ?? 'Choose'}
                </Text>
                <ChevronDown size={18} color={colors.primary} />
              </Pressable>
              {expanded === field.name ? (
                <View className="flex-row flex-wrap gap-2 px-1">
                  {field.choices.map(([value, label]) => {
                    const on = draft[field.name] === value;
                    return (
                      <Pressable
                        key={value}
                        accessibilityRole="radio"
                        accessibilityLabel={field.label + ': ' + label}
                        accessibilityState={{ checked: on, disabled }}
                        disabled={disabled}
                        className={
                          'min-h-10 justify-center rounded-pill border px-4 ' +
                          (on ? 'border-primary bg-primary' : 'border-border bg-icy')
                        }
                        onPress={() => {
                          change({ ...draft, [field.name]: value });
                          setExpanded(undefined);
                        }}
                      >
                        <Text
                          className={
                            'font-heading text-sm ' + (on ? 'text-surface' : 'text-primary')
                          }
                        >
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </>
          ) : (
            <View className="min-h-12 flex-row items-center gap-2 rounded-input border border-border bg-icy px-3">
              <FieldIcon label={field.label} />
              <Text className="flex-1 font-body text-sm text-secondary">{short(field.label)}</Text>
              <TextInput
                accessibilityLabel={field.label}
                value={draft[field.name]}
                onChangeText={(value) => change({ ...draft, [field.name]: value })}
                editable={!disabled}
                maxLength={field.amount ? 17 : 16}
                keyboardType={field.amount ? 'decimal-pad' : 'number-pad'}
                className="min-h-10 w-24 rounded-input border border-border bg-inputSurface px-3 text-center font-heading text-body text-text"
              />
            </View>
          )}
        </View>
      ))}
      {error ? <Copy alert>{error}</Copy> : null}
      <Button label="Save new billing policy version" disabled={disabled} onPress={save} />
      <Button secondary label="Cancel billing policy edit" disabled={disabled} onPress={cancel} />
    </View>
  );
}
