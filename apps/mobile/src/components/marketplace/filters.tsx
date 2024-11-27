import { NumericTextInput as TextInput } from '../grouped-number-input';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../navigation/header';
import { NatureBackground } from '../visual-surfaces';
import { mobileSurfaces } from '@hsm/ui';
import { useState } from 'react';
import { Modal, ScrollView, Switch, Text, View } from 'react-native';
import { billingFormPaisa, billingFormRupees } from '@hsm/api-client';
import { marketplaceQuerySchema, type MarketplaceQuery } from '@hsm/contracts';
import { mobileMarketplaceColors as colors, marketplaceMetrics as metrics } from '@hsm/ui';
import { DateField } from '../date-field';
import { MarketplaceAction } from './action';
const categories = [
  ['', 'All categories'],
  ['boys', 'Boys'],
  ['girls', 'Girls'],
  ['working_male', 'Working men'],
  ['working_female', 'Working women'],
] as const;
const kinds = [
  ['', 'Beds and rooms'],
  ['bed', 'Shared bed'],
  ['room', 'Whole room'],
] as const;
const sorts = [
  ['', 'Default order'],
  ['recommended', 'Recommended'],
  ['nearest', 'Nearest'],
  ['price_asc', 'Lowest price'],
  ['price_desc', 'Highest price'],
  ['most_available', 'Most available'],
] as const;
// Every key this sheet controls; callers drop them so a cleared filter is really removed.
export const filterKeys = [
  'moveInDate',
  'moveOutDate',
  'availableOnly',
  'minimumRentPaisa',
  'maximumRentPaisa',
  'maximumDepositPaisa',
  'capacity',
  'category',
  'optionKind',
  'sort',
  'cursor',
] as const;
export function applyFilters(
  current: Partial<MarketplaceQuery>,
  value: Partial<MarketplaceQuery>,
): Partial<MarketplaceQuery> {
  const next: Partial<MarketplaceQuery> = {};
  for (const [key, entry] of Object.entries(current))
    if (!(filterKeys as readonly string[]).includes(key)) Object.assign(next, { [key]: entry });
  return { ...next, ...value };
}
function money(value?: number) {
  return value === undefined ? '' : billingFormRupees(value);
}
function paisa(value: string) {
  return value.trim() ? billingFormPaisa(value) : undefined;
}
function Choice<T extends string>({
  label,
  options,
  value,
  change,
}: {
  label: string;
  options: readonly (readonly [T, string])[];
  value: T;
  change: (value: T) => void;
}) {
  return (
    <View style={{ gap: metrics.sm }}>
      <Text style={{ color: colors.heading }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: metrics.sm }}>
        {options.map(([option, text]) => (
          <MarketplaceAction
            key={option || 'all'}
            label={text}
            secondary={value !== option}
            onPress={() => change(option)}
          />
        ))}
      </View>
    </View>
  );
}
// p.13: rent, deposit, category, seater, option kind, dates and organic sort.
export function MarketplaceFilters({
  query,
  apply,
  close,
}: {
  query: Partial<MarketplaceQuery>;
  apply: (value: Partial<MarketplaceQuery>) => void;
  close: () => void;
}) {
  const [moveIn, setMoveIn] = useState(query.moveInDate ?? '');
  const [moveOut, setMoveOut] = useState(query.moveOutDate ?? '');
  const [available, setAvailable] = useState(query.availableOnly ?? false);
  const [minimum, setMinimum] = useState(money(query.minimumRentPaisa));
  const [maximum, setMaximum] = useState(money(query.maximumRentPaisa));
  const [deposit, setDeposit] = useState(money(query.maximumDepositPaisa));
  const [capacity, setCapacity] = useState(query.capacity ? String(query.capacity) : '');
  const [category, setCategory] = useState<(typeof categories)[number][0]>(query.category ?? '');
  const [kind, setKind] = useState<(typeof kinds)[number][0]>(query.optionKind ?? '');
  const [sort, setSort] = useState<(typeof sorts)[number][0]>(query.sort ?? '');
  const [error, setError] = useState(false);
  function submit() {
    let input;
    try {
      input = marketplaceQuerySchema.safeParse({
        moveInDate: moveIn || undefined,
        moveOutDate: moveOut || undefined,
        availableOnly: String(available),
        minimumRentPaisa: paisa(minimum),
        maximumRentPaisa: paisa(maximum),
        maximumDepositPaisa: paisa(deposit),
        capacity: capacity.trim() || undefined,
        category: category || undefined,
        optionKind: kind || undefined,
        sort: sort || undefined,
        universityPlaceId: query.universityPlaceId,
        radiusMeters: query.radiusMeters,
      });
    } catch {
      input = undefined;
    }
    setError(!input?.success);
    if (input?.success) {
      apply(input.data);
      close();
    }
  }
  const fields = [
    { label: 'Minimum monthly rent (PKR)', value: minimum, change: setMinimum, hint: '' },
    { label: 'Maximum monthly rent (PKR)', value: maximum, change: setMaximum, hint: '' },
    { label: 'Maximum security deposit (PKR)', value: deposit, change: setDeposit, hint: '' },
    { label: 'Seater (beds per room)', value: capacity, change: setCapacity, hint: '' },
  ];
  return (
    <Modal visible presentationStyle="pageSheet" onRequestClose={close}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <NatureBackground />
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: metrics.xxl,
            gap: metrics.lg,
            width: '100%',
            maxWidth: 680,
            alignSelf: 'center',
          }}
        >
          <AppHeader title="Filters" onBack={close} />
          <DateField label="Move-in date" value={moveIn} onChange={setMoveIn} optional />
          <DateField label="Move-out date" value={moveOut} onChange={setMoveOut} optional />
          {fields.map((field) => (
            <View key={field.label} style={{ gap: metrics.sm }}>
              <Text style={{ color: colors.heading }}>{field.label}</Text>
              <TextInput
                keyboardType={field.change === setCapacity ? 'number-pad' : 'decimal-pad'}
                accessibilityLabel={field.label}
                value={field.value}
                onChangeText={field.change}
                placeholder={field.hint}
                placeholderTextColor={colors.secondary}
                maxLength={17}
                style={{
                  minHeight: metrics.touch,
                  borderRadius: metrics.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                  color: colors.heading,
                  backgroundColor: mobileSurfaces.icyCard.backgroundColor,
                  padding: metrics.md,
                }}
              />
            </View>
          ))}
          <Choice
            label="Hostel category"
            options={categories}
            value={category}
            change={setCategory}
          />
          <Choice label="Room option" options={kinds} value={kind} change={setKind} />
          <Choice
            label="Sort by"
            options={sorts.filter(([value]) => value !== 'nearest' || query.universityPlaceId)}
            value={sort}
            change={setSort}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: metrics.md }}>
            <Text style={{ color: colors.heading, flex: 1 }}>Only available for these dates</Text>
            <Switch
              accessibilityLabel="Only available for these dates"
              value={available}
              onValueChange={setAvailable}
              trackColor={{ false: colors.disabled, true: colors.primary }}
            />
          </View>
          {error ? (
            <Text accessibilityRole="alert" style={{ color: colors.error }}>
              Check the amounts, seater size and both stay dates. Availability and Most available
              need dates.
            </Text>
          ) : null}
          <MarketplaceAction label="Apply filters" onPress={submit} />
          <MarketplaceAction
            label="Clear filters"
            secondary
            onPress={() => {
              apply({});
              close();
            }}
          />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
