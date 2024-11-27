import { useState } from 'react';
import { Text, View } from 'react-native';
import { stayRangeSchema, type StayRange } from '@hsm/contracts';
import { mobileMarketplaceColors as colors, marketplaceMetrics as metrics } from '@hsm/ui';
import { DateField } from '../date-field';
import { MarketplaceAction } from './action';
export function PublicInventoryDates({
  busy,
  onApply,
}: {
  busy: boolean;
  onApply: (range: StayRange | undefined) => void;
}) {
  const [start, setStart] = useState(''),
    [end, setEnd] = useState(''),
    [invalid, setInvalid] = useState(false);
  function apply() {
    if (busy) return;
    const result = stayRangeSchema.safeParse({ moveInDate: start, moveOutDate: end });
    setInvalid(!result.success);
    if (result.success) onApply(result.data);
  }
  return (
    <View style={{ gap: metrics.md }}>
      <Text accessibilityRole="header" style={{ color: colors.heading }}>
        Stay dates
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: metrics.md }}>
        {[
          { label: 'Availability move-in', title: 'Move in', value: start, update: setStart },
          { label: 'Availability move-out', title: 'Move out', value: end, update: setEnd },
        ].map((field) => (
          <View key={field.label} style={{ flex: 1, minWidth: 130, gap: metrics.xs }}>
            <DateField
              label={field.title}
              value={field.value}
              onChange={field.update}
              disabled={busy}
              optional
            />
          </View>
        ))}
      </View>
      {invalid ? (
        <Text accessibilityRole="alert" style={{ color: colors.error }}>
          Choose a valid complete stay range. The end date is excluded.
        </Text>
      ) : null}
      <MarketplaceAction label="Apply availability dates" disabled={busy} onPress={apply} />
      <MarketplaceAction
        secondary
        label="Clear availability dates"
        disabled={busy}
        onPress={() => {
          if (!busy) {
            setStart('');
            setEnd('');
            setInvalid(false);
            onApply(undefined);
          }
        }}
      />
    </View>
  );
}
