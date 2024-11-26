import { NumericTextInput as TextInput } from './grouped-number-input';
import { useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { billingFormPaisa, marketplacePrice, ownStayPaymentSummary } from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { FilterChip } from './inventory-tools';
import { Copy } from './ui';

export function usePaySecurity(actorId: string, stayId: string, enabled: boolean) {
  const [selected, setSelected] = useState(true),
    [amount, setAmount] = useState<string>();
  const query = useQuery({
    queryKey: ['own-payment-summary', actorId, stayId],
    enabled,
    gcTime: 0,
    retry: false,
    queryFn: async () => ownStayPaymentSummary(await actorClient(actorId), stayId),
  });
  const due = query.data?.outstandingDepositPaisa ?? 0;
  const pending = (query.data?.pendingDepositPaisa ?? 0) > 0;
  const typed = amount ?? (due ? String(due / 100) : '');
  let deposit = 0;
  try {
    deposit = selected && !pending && due > 0 ? billingFormPaisa(typed) : 0;
  } catch {
    deposit = -1;
  }
  return {
    query,
    due,
    pending,
    typed,
    deposit,
    selected,
    setSelected,
    setAmount,
    valid: !query.isPending && !query.error && deposit >= 0 && deposit <= due,
    reset: () => {
      setAmount(undefined);
      setSelected(true);
    },
  };
}
export function PaySecurity({
  value,
  onChange,
}: {
  value: ReturnType<typeof usePaySecurity>;
  onChange: () => void;
}) {
  if (value.query.error) return <Copy alert>{safeMessage(value.query.error)}</Copy>;
  if (value.query.isPending) return <Copy>Loading security balance…</Copy>;
  if (!value.due) return null;
  return (
    <View className="gap-2">
      {!value.pending ? (
        <FilterChip
          text={'Security deposit · ' + marketplacePrice(value.due)}
          label="Include security deposit"
          selected={value.selected && !value.pending}
          onPress={() => {
            onChange();
            value.setSelected(!value.selected);
          }}
        />
      ) : null}
      {value.pending ? (
        <Copy>Security proof is already awaiting hostel verification. Do not pay it again.</Copy>
      ) : value.selected ? (
        <TextInput
          accessibilityLabel="Security deposit paid (PKR)"
          keyboardType="decimal-pad"
          value={value.typed}
          onChangeText={(text) => {
            onChange();
            value.setAmount(text);
          }}
          className="min-h-12 rounded-input border border-border bg-inputSurface px-4 py-3 font-body text-body text-text"
        />
      ) : null}
      {!value.valid ? (
        <Copy alert>Security must be between zero and the remaining agreed deposit.</Copy>
      ) : null}
    </View>
  );
}
