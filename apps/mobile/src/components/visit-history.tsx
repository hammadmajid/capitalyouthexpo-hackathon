import { Skeleton } from './loading/skeleton';
import { useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { readVisitHistory, formatVisitStart } from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { Button, Copy } from './ui';
export function VisitHistory({
  actorId,
  visitId,
  branchId,
}: {
  actorId: string;
  visitId: string;
  branchId?: string;
}) {
  const [open, setOpen] = useState(false),
    [cursor, setCursor] = useState<string>();
  const query = useQuery({
    queryKey: ['visits', actorId, branchId ?? 'own', visitId, 'history', cursor],
    gcTime: 0,
    retry: false,
    enabled: open,
    queryFn: async () =>
      readVisitHistory(await actorClient(actorId), visitId, cursor ? { cursor } : {}, branchId),
  });
  return (
    <View className="gap-3">
      <Button
        secondary
        label={open ? 'Hide visit history' : 'View visit history'}
        onPress={() => setOpen((value) => !value)}
      />
      {open ? (
        query.isError ? (
          <>
            <Copy alert>{safeMessage(query.error)}</Copy>
          </>
        ) : query.isFetching || query.isPending ? (
          <Skeleton kind="list" label="Loading current visit history…" />
        ) : query.data ? (
          <>
            <Copy>
              {query.data.branchName} · {query.data.customerName}
            </Copy>
            {!query.data.data.length ? <Copy>No history on this page.</Copy> : null}
            {query.data.data.map((entry) => (
              <View className="gap-2" key={entry.id}>
                <Copy>
                  {entry.action.replaceAll('-', ' ')} · {formatVisitStart(entry.createdAt)}
                </Copy>
                <Copy>Requested: {formatVisitStart(entry.requestedStart)}</Copy>
                {entry.proposedStart ? (
                  <Copy>Proposed: {formatVisitStart(entry.proposedStart)}</Copy>
                ) : null}
                {entry.reason ? <Copy>{entry.reason}</Copy> : null}
              </View>
            ))}
            <Button
              secondary
              label="First history page"
              disabled={!cursor}
              onPress={() => setCursor(undefined)}
            />
            <Button
              secondary
              label="Next history page"
              disabled={!query.data.nextCursor}
              onPress={() => {
                if (query.data?.nextCursor) setCursor(query.data.nextCursor);
              }}
            />
          </>
        ) : null
      ) : null}
    </View>
  );
}
