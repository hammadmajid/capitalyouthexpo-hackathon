import { useState } from 'react';
import { Linking, View } from 'react-native';
import { Bus, Receipt } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import {
  branchPaymentProofQueue,
  marketplacePrice,
  readBranchTransport,
  stayPaymentProofLink,
} from '@hsm/api-client';
import { formatDate } from '@hsm/contracts';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { proofBills } from '../lib/proof-bills';
import { Skeleton } from './loading/skeleton';
import { InvFact, StatusDot } from './inventory-tools';
import { Button, Copy } from './ui';
type Props = { actorId: string; branchId: string; stayId: string };
// CHG-048 / BED-002: the bed resident's proofs and transport, opened from the bed's tiles.
// Each read is the existing branch-scoped endpoint narrowed to this Stay; the server rechecks
// finance_view on every call.
const proofState = { submitted: 'Waiting for review', approved: 'Approved', rejected: 'Rejected' };
// PAY-004..006: newest proofs first; opening one uses the short-lived private signed link.
export function BedProofs(props: Props) {
  const [error, setError] = useState<string>();
  const proofs = useQuery({
    queryKey: ['payment-proof-queue', props.actorId, props.branchId, 'stay', props.stayId],
    gcTime: 0,
    retry: false,
    queryFn: async () =>
      branchPaymentProofQueue(await actorClient(props.actorId), props.branchId, {
        stayId: props.stayId,
        limit: 10,
      }),
  });
  return (
    <View className="gap-2" accessibilityLabel="Payment proofs">
      {proofs.isPending ? <Skeleton kind="inline" label="Loading payment proofs" /> : null}
      {proofs.isError ? <Copy alert>{safeMessage(proofs.error)}</Copy> : null}
      {error ? <Copy alert>{error}</Copy> : null}
      {proofs.data?.data.length === 0 ? <Copy>No proofs sent</Copy> : null}
      {proofs.data?.data.map(({ proof }) => (
        <View key={proof.id} className="gap-1">
          <InvFact Icon={Receipt}>
            {proofBills(proof)} · {marketplacePrice(proof.amountPaisa)} · paid on{' '}
            {formatDate(proof.paidOn + 'T00:00:00.000Z')}
          </InvFact>
          <StatusDot
            status={
              proof.state === 'approved'
                ? 'active'
                : proof.state === 'rejected'
                  ? 'blocked'
                  : 'reserved'
            }
            text={proofState[proof.state]}
          />
          <Button
            secondary
            label={'View proof ' + proof.invoiceNumber}
            onPress={() =>
              void actorClient(props.actorId)
                .then((client) => stayPaymentProofLink(client, props.branchId, proof.id))
                .then((link) => Linking.openURL(link.url))
                .then(
                  () => setError(undefined),
                  (failure: unknown) => setError(safeMessage(failure)),
                )
            }
          />
        </View>
      ))}
    </View>
  );
}
const riding = {
  requested: 'Asked to join',
  active: 'Riding',
  ended: 'Ended',
  rejected: 'Declined',
  withdrawn: 'Withdrawn',
};
// SERV-002: transport only shows when the resident has (or asked for) a subscription.
export function BedTransport(props: Props) {
  const transport = useQuery({
    queryKey: ['branch-transport', props.actorId, props.branchId, 'stay', props.stayId],
    gcTime: 0,
    retry: false,
    queryFn: async () =>
      readBranchTransport(await actorClient(props.actorId), props.branchId, {
        stayId: props.stayId,
        limit: 5,
      }),
  });
  const rows = transport.data?.data ?? [];
  if (!rows.length) return null;
  return (
    <View className="gap-2" accessibilityLabel="Transport">
      {rows.map((row) => (
        <View key={row.id} className="gap-1">
          <InvFact Icon={Bus}>
            {row.routeName} · {marketplacePrice(row.monthlyChargePaisa)} / month ·{' '}
            {riding[row.status]}
          </InvFact>
          {row.billing ? (
            <Copy alert={row.billing.state === 'overdue'}>
              Transport bill {row.billing.state} · {marketplacePrice(row.billing.outstandingPaisa)}{' '}
              outstanding
            </Copy>
          ) : null}
        </View>
      ))}
    </View>
  );
}
