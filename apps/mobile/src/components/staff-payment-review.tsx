import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { marketplacePrice } from '@hsm/api-client';
import { formatDate, type RecordExternalPaymentInput } from '@hsm/contracts';
import { Button, Copy } from './ui';
import type { PaymentPlan } from './payment-plan';
const methodText: Record<string, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank',
  jazzcash: 'JazzCash',
  easypaisa: 'Easypaisa',
  other: 'Other',
};
// PAY-008: one last look before saving; the recorder confirms the hostel got the money.
export function StaffPaymentReview({
  residentLabel,
  command,
  plan,
  labels,
  saveError,
  onEdit,
  onRecord,
}: {
  residentLabel: string;
  command: RecordExternalPaymentInput;
  plan: PaymentPlan;
  labels: string[];
  saveError?: string | undefined;
  onEdit: () => void;
  onRecord: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <View accessibilityLabel="Review external payment" className="gap-3">
      <Text className="font-heading text-subtitle text-heading">
        {marketplacePrice(command.amountPaisa)} from {residentLabel}
      </Text>
      <Copy>
        {methodText[command.method] ?? command.method} ·{' '}
        {formatDate(command.paidOn + 'T00:00:00.000Z')}
      </Copy>
      {command.allocations.map((row, index) => (
        <Copy key={row.invoiceId}>
          {labels.at(index)}: {marketplacePrice(row.amountPaisa)}
        </Copy>
      ))}
      {command.depositPaisa ? <Copy>Deposit: {marketplacePrice(command.depositPaisa)}</Copy> : null}
      {command.advanceCreditPaisa ? (
        <Copy>Advance: {marketplacePrice(command.advanceCreditPaisa)}</Copy>
      ) : null}
      {plan.allocations.length && plan.remainingPaisa > 0 ? (
        <Copy alert>Partial payment · {marketplacePrice(plan.remainingPaisa)} still due</Copy>
      ) : null}
      {command.proofFileId ? <Copy>Proof attached</Copy> : null}
      <View className="flex-row items-center gap-3">
        <Switch
          accessibilityLabel="Confirm directly received payment"
          accessibilityRole="switch"
          value={confirmed}
          onValueChange={setConfirmed}
        />
        <Text className="flex-1 font-body text-body text-text">Received by the hostel</Text>
      </View>
      {saveError ? (
        <View accessibilityRole="alert">
          <Copy alert>{saveError}</Copy>
        </View>
      ) : null}
      <Button label="Confirm recorded payment" disabled={!confirmed} onPress={onRecord} />
      <Button secondary label="Edit payment" onPress={onEdit} />
    </View>
  );
}
