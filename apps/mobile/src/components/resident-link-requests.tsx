import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { decideResidentAccountLink, readResidentAccountLinks } from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { Button, Copy } from './ui';

export function ResidentLinkRequests({ actorId, branchId }: { actorId: string; branchId: string }) {
  const cache = useQueryClient(),
    [cursor, setCursor] = useState<string>();
  const key = ['resident-account-links', actorId, branchId];
  const page = useQuery({
    queryKey: [...key, cursor],
    gcTime: 0,
    retry: false,
    queryFn: async () => readResidentAccountLinks(await actorClient(actorId), branchId, cursor),
  });
  const decision = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      decideResidentAccountLink(await actorClient(actorId), branchId, id, { action }),
    onSettled: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: key }),
        cache.invalidateQueries({ queryKey: ['resident-directory', actorId, branchId] }),
        cache.invalidateQueries({ queryKey: ['private-stays'] }),
        cache.invalidateQueries({ queryKey: ['resident-profile', actorId, branchId] }),
        cache.invalidateQueries({ queryKey: ['stay-resident-photo', actorId, branchId] }),
      ]);
    },
  });
  if (page.isError) return <Copy alert>{safeMessage(page.error)}</Copy>;
  if (!page.data?.data.length && !cursor) return null;
  return (
    <View className="gap-3" accessibilityLabel="Account link requests">
      <Copy>Account requests</Copy>
      {page.data?.data.map((request) => (
        <View key={request.id} className="gap-2">
          <Copy>
            {request.customerName} → {request.residentName}
          </Copy>
          <Copy>{request.phone}</Copy>
          <Copy>
            Approve only if this is the resident. Their account will show this stay and its bills.
          </Copy>
          <View className="flex-row gap-2">
            <Button
              label="Approve account"
              disabled={decision.isPending || page.isFetching}
              onPress={() => decision.mutate({ id: request.id, action: 'approve' })}
            />
            <Button
              secondary
              label="Reject"
              disabled={decision.isPending || page.isFetching}
              onPress={() => decision.mutate({ id: request.id, action: 'reject' })}
            />
          </View>
        </View>
      ))}
      {decision.isError ? <Copy alert>{safeMessage(decision.error)}</Copy> : null}
      {page.data?.nextCursor ? (
        <Button
          secondary
          label="More account requests"
          onPress={() => setCursor(page.data?.nextCursor ?? undefined)}
        />
      ) : null}
      {cursor ? (
        <Button secondary label="First account requests" onPress={() => setCursor(undefined)} />
      ) : null}
    </View>
  );
}
