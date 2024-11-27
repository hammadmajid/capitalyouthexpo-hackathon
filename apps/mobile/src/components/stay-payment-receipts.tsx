import { useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { branchPaymentProofQueue, ownStayPaymentProofs, marketplacePrice } from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { Button, Copy } from './ui';
import { StayReceipt } from './stay-receipt';

// PAY-009: only approved, server-issued receipts; paging retains historical months.
export function StayPaymentReceipts(props: {
  actorId: string;
  branchId?: string | undefined;
  stayId: string;
}) {
  const [cursor, setCursor] = useState<string>(),
    [selected, setSelected] = useState<string>();
  const query = useQuery({
    queryKey: [
      'approved-stay-proofs',
      props.actorId,
      props.branchId ?? 'own',
      props.stayId,
      cursor,
    ],
    gcTime: 0,
    retry: false,
    queryFn: async () => {
      const client = await actorClient(props.actorId),
        options = { state: 'approved', ...(cursor ? { cursor } : {}) };
      if (props.branchId) {
        const page = await branchPaymentProofQueue(client, props.branchId, {
          ...options,
          stayId: props.stayId,
        });
        return { data: page.data.map((row) => row.proof), nextCursor: page.nextCursor };
      }
      return ownStayPaymentProofs(client, props.stayId, options);
    },
  });
  if (query.error) return <Copy alert>{safeMessage(query.error)}</Copy>;
  return (
    <View className="gap-2">
      {query.data?.data.map((proof) =>
        proof.receiptId ? (
          <View key={proof.id} className="gap-2">
            <Button
              secondary
              label={'Receipt · ' + proof.paidOn + ' · ' + marketplacePrice(proof.amountPaisa)}
              onPress={() =>
                setSelected(
                  selected === proof.receiptId ? undefined : (proof.receiptId ?? undefined),
                )
              }
            />
            {selected === proof.receiptId ? (
              <StayReceipt {...props} receiptId={proof.receiptId} />
            ) : null}
          </View>
        ) : null,
      )}
      {query.data?.nextCursor ? (
        <Button
          secondary
          label="Older receipts"
          onPress={() => {
            setSelected(undefined);
            setCursor(query.data?.nextCursor ?? undefined);
          }}
        />
      ) : null}
      {cursor ? (
        <Button
          secondary
          label="Latest receipts"
          onPress={() => {
            setSelected(undefined);
            setCursor(undefined);
          }}
        />
      ) : null}
    </View>
  );
}
