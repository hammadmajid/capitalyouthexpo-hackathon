import { NumericTextInput as TextInput } from './grouped-number-input';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Banknote, ChevronDown, ChevronUp } from 'lucide-react-native';
import { externalPaymentMethodSchema } from '@hsm/contracts';
import { mobileColors as colors } from '@hsm/ui';
import { FilterChip, IconChip } from './inventory-tools';
import { PriceSection } from './price-form-parts';
import { DateField } from './date-field';
import type { PaymentEntry } from './payment-plan';
const methodText: Record<string, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank',
  jazzcash: 'JazzCash',
  easypaisa: 'Easypaisa',
  other: 'Other',
};
const input =
  'min-h-12 flex-1 rounded-input border border-border bg-inputSurface px-4 font-body text-body text-text';
// One input; the accessible name stays the full label, the visible hint is short.
function Field(props: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  money?: boolean;
  maxLength?: number;
  grow?: boolean;
  inline?: boolean;
}) {
  return (
    <View className={props.grow ? 'flex-1 gap-1' : 'gap-1'}>
      {props.inline ? null : <Text className="font-body text-sm text-secondary">{props.hint}</Text>}
      <View className="flex-row items-center gap-2">
        {props.money ? <Text className="font-heading text-body text-heading">Rs</Text> : null}
        <TextInput
          accessibilityLabel={props.label}
          value={props.value}
          maxLength={props.maxLength ?? 17}
          keyboardType={props.money ? 'decimal-pad' : 'default'}
          placeholder={props.money ? '0' : props.inline ? props.hint : undefined}
          placeholderTextColor={colors.secondary}
          onChangeText={props.onChange}
          className={input}
        />
      </View>
    </View>
  );
}
// PAY-008: what was received, how and when. Deposit, note and reference sit under "More".
export function PaymentFormFields({
  value,
  onChange,
  hideDeposit = false,
}: {
  value: PaymentEntry;
  onChange: (patch: Partial<PaymentEntry>) => void;
  hideDeposit?: boolean;
}) {
  const [more, setMore] = useState(false);
  return (
    <View className="gap-3">
      <PriceSection Icon={Banknote} title="Amount received">
        <Field
          inline
          label="Total received (PKR)"
          hint="Total"
          money
          value={value.amount}
          onChange={(amount) => onChange({ amount })}
        />
        <View
          accessibilityLabel={'Payment method: ' + (methodText[value.method] ?? 'Select')}
          className="flex-row flex-wrap gap-2"
        >
          {externalPaymentMethodSchema.options.map((method) => (
            <FilterChip
              key={method}
              grow
              text={methodText[method] ?? method}
              label={'Pay by ' + (methodText[method] ?? method)}
              selected={value.method === method}
              onPress={() => onChange({ method })}
            />
          ))}
        </View>
        <DateField
          label="Date received"
          value={value.paidOn}
          onChange={(paidOn) => onChange({ paidOn })}
        />
      </PriceSection>
      <View style={{ alignSelf: 'flex-start' }}>
        <IconChip
          Icon={more ? ChevronUp : ChevronDown}
          text="More"
          label={
            hideDeposit
              ? 'Note and reference'
              : more
                ? 'Hide deposit, note and reference'
                : 'Deposit, note and reference'
          }
          onPress={() => setMore(!more)}
        />
      </View>
      {more ? (
        <View className="gap-2">
          {hideDeposit ? null : (
            <Field
              label="Deposit received (PKR)"
              hint="Deposit (part of the total)"
              money
              value={value.deposit}
              onChange={(deposit) => onChange({ deposit })}
            />
          )}
          <Field
            inline
            label="Recording note"
            hint="Note"
            maxLength={500}
            value={value.note}
            onChange={(note) => onChange({ note })}
          />
          <Field
            inline
            label="External reference (optional)"
            hint="Reference (optional)"
            maxLength={160}
            value={value.transactionReference}
            onChange={(transactionReference) => onChange({ transactionReference })}
          />
        </View>
      ) : null}
    </View>
  );
}
