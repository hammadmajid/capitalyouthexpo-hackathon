import { Skeleton } from './loading/skeleton';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { StayFinalStatementResponse, StaySettlement } from '@hsm/contracts';
import { marketplacePrice, readFinalStatement, readStaySettlement } from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { Copy } from './ui';
import {
  ArrowDownLeft,
  ArrowUpRight,
  MinusCircle,
  Receipt,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from 'lucide-react-native';
import { mobileColors as colors } from '@hsm/ui';
function Stat(props: {
  Icon: LucideIcon;
  label: string;
  short: string;
  value: number;
  alert?: boolean;
}) {
  const tone = props.alert && props.value > 0 ? colors.dangerText : colors.heading;
  return (
    <View
      accessible
      accessibilityLabel={props.label + ': ' + marketplacePrice(props.value)}
      style={{ flexBasis: '47%', flexGrow: 1 }}
      className="gap-1 rounded-input border border-border bg-icy p-3"
    >
      <View className="flex-row items-center gap-1">
        <props.Icon size={16} color={colors.secondary} />
        <Text className="font-body text-xs text-secondary">{props.short}</Text>
      </View>
      <Text className="font-heading text-body" style={{ color: tone }}>
        {marketplacePrice(props.value)}
      </Text>
    </View>
  );
}
function Figures({ settlement }: { settlement: StaySettlement }) {
  return (
    <View className="gap-1" accessibilityLabel="Settlement figures">
      {settlement.lastApprovedPayment ? (
        <Copy>
          Last approved payment: {marketplacePrice(settlement.lastApprovedPayment.amountPaisa)} ·{' '}
          {settlement.lastApprovedPayment.receivedOn} ·{' '}
          {settlement.lastApprovedPayment.receiptNumber}
        </Copy>
      ) : null}
      {settlement.nextInvoiceDueDate ? (
        <Copy>Next issued invoice due: {settlement.nextInvoiceDueDate}</Copy>
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        <Stat
          Icon={Receipt}
          label="Outstanding invoices"
          short="Due"
          value={settlement.outstandingPaisa}
          alert
        />
        <Stat
          Icon={ArrowUpRight}
          label="Resident still owes"
          short="Owes"
          value={settlement.netPayablePaisa}
          alert
        />
        <Stat
          Icon={ShieldCheck}
          label="Deposit held"
          short="Deposit"
          value={settlement.deposit.heldPaisa}
        />
        <Stat
          Icon={MinusCircle}
          label="Deposit deducted"
          short="Deducted"
          value={settlement.deposit.deductedPaisa}
        />
        <Stat
          Icon={Wallet}
          label="Advance credit"
          short="Advance"
          value={settlement.advance.heldPaisa}
        />
        <Stat
          Icon={ArrowDownLeft}
          label="Hostel still owes back"
          short="Refund due"
          value={settlement.netRefundablePaisa}
        />
      </View>
    </View>
  );
}
// OUT-005 / STAY-004: live settlement while open; the frozen statement once closed.
export function NativeSettlement(props: {
  actorId: string;
  stayId: string;
  branchId?: string;
  closed: boolean;
}) {
  const query = useQuery({
    queryKey: [
      'stay-settlement',
      props.actorId,
      props.branchId ?? 'own',
      props.stayId,
      props.closed,
    ],
    gcTime: 0,
    retry: false,
    queryFn: async () => {
      const client = await actorClient(props.actorId);
      if (!props.closed)
        return { settlement: await readStaySettlement(client, props.stayId, props.branchId) };
      const final = await readFinalStatement(client, props.stayId, props.branchId);
      return { settlement: final.statement, after: final.afterCheckout };
    },
  });
  if (query.isPending) return <Skeleton kind="details" label="Loading settlement…" />;
  if (query.isError) return <Copy alert>{safeMessage(query.error)}</Copy>;
  const after = query.data.after;
  return (
    <View className="gap-1">
      {props.closed ? <Copy>Final statement</Copy> : null}
      <Figures settlement={query.data.settlement} />
      {after ? <AfterCheckout value={after} /> : null}
    </View>
  );
}
const movementLabel: Record<string, string> = {
  deposit_apply: 'Deposit applied to rent',
  advance_apply: 'Advance applied to rent',
  deposit_deduct: 'Deposit deducted',
  deposit_refund: 'Deposit refund recorded',
  advance_refund: 'Advance refund recorded',
  payment: 'Payment received',
};
// P9-FIX-04: later records beside the frozen statement; what is owed is not "refunded".
function AfterCheckout({ value }: { value: StayFinalStatementResponse['afterCheckout'] }) {
  return (
    <View className="gap-1" accessibilityLabel="After checkout">
      <Copy>Recorded after checkout</Copy>
      {value.movements.length === 0 ? <Copy>Nothing has been recorded since checkout.</Copy> : null}
      {value.movements.map((row, index) => (
        <Copy key={row.recordedAt + index}>
          {row.recordedAt.slice(0, 10)}: {movementLabel[row.kind] ?? row.kind}{' '}
          {marketplacePrice(row.amountPaisa)}
          {row.externalReference ? ' · ref ' + row.externalReference : ''}
        </Copy>
      ))}
      <Copy>
        Refund still owed by the hostel: {marketplacePrice(value.current.netRefundablePaisa)}
      </Copy>
      <Copy>Refunds are paid by the hostel directly and appear here once recorded.</Copy>
    </View>
  );
}
