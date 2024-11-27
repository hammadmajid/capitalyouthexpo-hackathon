import { Skeleton } from './loading/skeleton';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { readVisitInterest } from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { Button, Copy } from './ui';
import type { useVisitCommand } from './use-visit-command';
export function VisitInterest({
  operation,
  actorId,
  visitId,
  branchId,
}: {
  operation: ReturnType<typeof useVisitCommand>;
  actorId: string;
  visitId: string;
  branchId?: string;
}) {
  const { mutation, locked } = operation;
  const ownCommand = operation.kind === 'interest' && operation.targetVisitId === visitId;
  const query = useQuery({
    queryKey: ['visits', actorId, branchId ?? 'own', visitId, 'interest'],
    gcTime: 0,
    retry: false,
    queryFn: async () => readVisitInterest(await actorClient(actorId), visitId, branchId),
  });
  if (query.isError)
    return (
      <>
        <Copy alert>{safeMessage(query.error)}</Copy>
      </>
    );
  if (query.isPending || query.isFetching || !query.data)
    return <Skeleton kind="list" label="Loading current visit response…" />;
  const state = query.data;
  function respond(stillInterested: boolean) {
    mutation.mutate({
      kind: 'interest',
      visitId,
      body: { expectedUpdatedAt: state.expectedUpdatedAt, stillInterested },
    });
  }
  return (
    <View className="gap-3">
      <Copy>
        {state.stillInterested === null
          ? branchId
            ? 'Customer has not responded after this visit.'
            : 'After your visit, are you still interested in this hostel?'
          : state.stillInterested
            ? 'Customer remains interested.'
            : 'Customer is no longer interested.'}
      </Copy>
      {!branchId ? (
        <>
          <Button
            disabled={locked || state.stillInterested === true}
            label="Still interested"
            onPress={() => respond(true)}
          />
          <Button
            secondary
            disabled={locked || state.stillInterested === false}
            label="Not interested"
            onPress={() => respond(false)}
          />
        </>
      ) : null}
      {ownCommand && mutation.error ? <Copy alert>{safeMessage(mutation.error)}</Copy> : null}
      {ownCommand && locked && !mutation.isPending ? (
        <Button label="Retry original visit response" onPress={() => mutation.mutate(undefined)} />
      ) : null}
      {ownCommand && mutation.isSuccess ? <Copy>Visit response saved.</Copy> : null}
    </View>
  );
}
