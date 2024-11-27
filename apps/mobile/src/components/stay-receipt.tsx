import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { readCustomerStayReceipt, readStaffStayReceipt } from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import { receiptDocument } from '../lib/financial-document';
import { safeMessage } from '../lib/messages';
import { Copy } from './ui';
import { FinancialDocument } from './financial-document';
import { Skeleton } from './loading/skeleton';

export function StayReceipt(props: {
  actorId: string;
  branchId?: string | undefined;
  stayId: string;
  receiptId: string;
}) {
  const query = useQuery({
    queryKey: [
      'private-receipt',
      props.actorId,
      props.branchId ?? 'own',
      props.stayId,
      props.receiptId,
    ],
    gcTime: 0,
    retry: false,
    queryFn: async () => {
      const client = await actorClient(props.actorId);
      return props.branchId
        ? readStaffStayReceipt(client, props.branchId, props.stayId, props.receiptId)
        : readCustomerStayReceipt(client, props.stayId, props.receiptId);
    },
  });
  if (query.isPending || query.isFetching)
    return <Skeleton kind="details" label="Loading payment receipt" />;
  if (query.error) return <Copy alert>{safeMessage(query.error)}</Copy>;
  return query.data ? (
    <View accessibilityLabel="Approved payment receipt">
      <FinancialDocument document={receiptDocument(query.data)} />
    </View>
  ) : null;
}
