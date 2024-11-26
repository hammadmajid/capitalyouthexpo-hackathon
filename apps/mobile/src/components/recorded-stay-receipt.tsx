import { Skeleton } from './loading/skeleton';
import { Text, View } from 'react-native';
import { CircleCheck } from 'lucide-react-native';
import { marketplacePrice } from '@hsm/api-client';
import { formatDate } from '@hsm/contracts';
import { mobileColors as colors } from '@hsm/ui';
import type { useStaffStayPayment } from './use-staff-stay-payment';
import { safeMessage } from '../lib/messages';
import { Copy } from './ui';
import { FinancialDocument } from './financial-document';
import { receiptDocument } from '../lib/financial-document';
const methodText: Record<string, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank',
  jazzcash: 'JazzCash',
  easypaisa: 'Easypaisa',
  other: 'Other',
};
// PAY-008 / ACC-004: the server receipt, shown briefly. The bill turns paid only through
// its receipt-backed balance, so this view never claims a bill is settled.
export function RecordedStayReceipt({
  query,
}: {
  query: ReturnType<typeof useStaffStayPayment>['receipt'];
}) {
  if (query.error)
    return (
      <>
        <Copy alert>{safeMessage(query.error)}</Copy>
      </>
    );
  if (query.isPending || query.isFetching) return <Skeleton kind="list" label="Loading receipt…" />;
  const value = query.data;
  if (!value) return null;
  const receipt = value.snapshot;
  return (
    <View accessibilityLabel="Recorded payment receipt" className="gap-2">
      <View className="flex-row items-center gap-2">
        <CircleCheck size={22} color={colors.success} />
        <Text className="flex-1 font-heading text-subtitle text-heading">
          {marketplacePrice(receipt.amountPaisa)} received
        </Text>
      </View>
      {value.reversed ? <Copy alert>Reversed</Copy> : null}
      <Copy>
        {receipt.residentName} · {methodText[receipt.method] ?? receipt.method} ·{' '}
        {formatDate(receipt.paidOn + 'T00:00:00.000Z')}
      </Copy>
      {receipt.allocations.length ? (
        <Copy>Rent: {marketplacePrice(receipt.distribution.allocatedPaisa)}</Copy>
      ) : null}
      {receipt.distribution.depositPaisa ? (
        <Copy>Deposit: {marketplacePrice(receipt.distribution.depositPaisa)}</Copy>
      ) : null}
      {receipt.distribution.advanceCreditPaisa ? (
        <Copy>Advance: {marketplacePrice(receipt.distribution.advanceCreditPaisa)}</Copy>
      ) : null}
      {receipt.transactionReference ? <Copy>Ref {receipt.transactionReference}</Copy> : null}
      <Text numberOfLines={1} className="font-body text-xs text-secondary">
        Receipt {value.receiptNumber}
      </Text>
      <FinancialDocument document={receiptDocument(value)} />
    </View>
  );
}
