import { useState } from 'react';
import { Image, Linking, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { stayPaymentProofLink } from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { Button, Copy } from './ui';
import { Skeleton } from './loading/skeleton';

export function PaymentProofPreview(props: { actorId: string; branchId: string; proofId: string }) {
  const [failed, setFailed] = useState(false),
    [error, setError] = useState<string>();
  const query = useQuery({
    queryKey: ['payment-proof-preview', props.actorId, props.branchId, props.proofId],
    gcTime: 0,
    staleTime: 0,
    retry: false,
    queryFn: async () =>
      stayPaymentProofLink(await actorClient(props.actorId), props.branchId, props.proofId),
  });
  if (query.isPending) return <Skeleton kind="details" label="Loading submitted invoice picture" />;
  if (query.error) return <Copy alert>{safeMessage(query.error)}</Copy>;
  const url = query.data?.url;
  return (
    <View style={{ gap: 8 }}>
      {url && !failed ? (
        <Image
          source={{ uri: url }}
          accessibilityLabel="Submitted payment proof picture"
          resizeMode="contain"
          style={{ width: '100%', height: 300 }}
          onError={() => setFailed(true)}
        />
      ) : null}
      {failed ? <Copy>Image preview unavailable. Open the original document below.</Copy> : null}
      {url ? (
        <Button
          secondary
          label="Open original payment proof"
          onPress={() => {
            void Linking.openURL(url).catch((failure: unknown) => setError(safeMessage(failure)));
          }}
        />
      ) : null}
      {error ? <Copy alert>{error}</Copy> : null}
    </View>
  );
}
