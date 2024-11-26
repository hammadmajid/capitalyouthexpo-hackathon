import { NumericTextInput as TextInput } from './grouped-number-input';
import { useState } from 'react';
import { View } from 'react-native';
import { billingFormPaisa } from '@hsm/api-client';
import { roomTypeInputSchema, type RoomTypeInput } from '@hsm/contracts';
import { FlowForm } from './flow-form';
import { Button, Copy } from './ui';

type Fee = { code: string; cadence: string; amount: string };
export function InventoryTypeForm({
  disabled,
  submit,
}: {
  disabled: boolean;
  submit: (input: RoomTypeInput) => Promise<void>;
}) {
  const [fees, setFees] = useState<Fee[]>([]);
  function change(index: number, patch: Partial<Fee>) {
    setFees((current) => current.map((fee, i) => (i === index ? { ...fee, ...patch } : fee)));
  }
  return (
    <FlowForm
      disabled={disabled}
      resetAfterSubmit={false}
      label="Save new room type"
      fields={[
        { name: 'name', label: 'Room type name' },
        {
          name: 'inventoryMode',
          label: 'Rent by',
          options: ['per_bed', 'whole_room', 'both'],
          optionLabels: { per_bed: 'Per bed', whole_room: 'Whole room', both: 'Bed or room' },
        },
        { name: 'capacity', label: 'Room capacity', keyboard: 'number-pad' },
        {
          name: 'bedRent',
          numberFormat: 'grouped',
          keyboard: 'decimal-pad',
          label: 'Monthly bed rent (Rs)',
        },
        {
          name: 'roomRent',
          numberFormat: 'grouped',
          keyboard: 'decimal-pad',
          label: 'Monthly room rent (Rs)',
        },
        {
          name: 'deposit',
          numberFormat: 'grouped',
          keyboard: 'decimal-pad',
          label: 'Security deposit (Rs)',
        },
      ]}
      extra={(_values, _set, busy) => (
        <View className="gap-3">
          <Copy>Fill the rent for the chosen option · deposit and fees are not assumed</Copy>
          {fees.map((fee, index) => (
            <View key={index} className="gap-2">
              <Copy>Fee {index + 1} · e.g. mess, utilities · monthly or one_time</Copy>
              {(['code', 'cadence', 'amount'] as const).map((field) => (
                <TextInput
                  keyboardType={field === 'amount' ? 'decimal-pad' : 'default'}
                  key={field}
                  accessibilityLabel={
                    'New fee ' + (index + 1) + ' ' + field + (field === 'amount' ? ' (Rs)' : '')
                  }
                  value={fee[field]}
                  onChangeText={(value) => change(index, { [field]: value })}
                  editable={!busy}
                  autoCapitalize="none"
                  maxLength={field === 'amount' ? 17 : 20}
                  className="min-h-12 rounded-input border border-border bg-inputSurface px-4 py-3 font-body text-body text-text"
                />
              ))}
              <Button
                secondary
                label={'Remove new fee ' + (index + 1)}
                disabled={busy}
                onPress={() => setFees((current) => current.filter((_, i) => i !== index))}
              />
            </View>
          ))}
          <Button
            secondary
            label="Add new disclosed fee"
            disabled={busy || fees.length >= 32}
            onPress={() =>
              setFees((current) => [...current, { code: '', cadence: '', amount: '' }])
            }
          />
        </View>
      )}
      submit={async (values) => {
        await submit(
          roomTypeInputSchema.parse({
            name: values.name,
            inventoryMode: values.inventoryMode,
            capacity: /^[1-9][0-9]*$/.test(values.capacity ?? '')
              ? Number(values.capacity)
              : undefined,
            bedMonthlyRentPaisa:
              values.inventoryMode === 'whole_room' ? null : billingFormPaisa(values.bedRent ?? ''),
            roomMonthlyRentPaisa:
              values.inventoryMode === 'per_bed' ? null : billingFormPaisa(values.roomRent ?? ''),
            depositPaisa: billingFormPaisa(values.deposit ?? ''),
            fees: fees.map((fee) => ({
              code: fee.code,
              cadence: fee.cadence,
              amountPaisa: billingFormPaisa(fee.amount),
            })),
          }),
        );
      }}
    />
  );
}
