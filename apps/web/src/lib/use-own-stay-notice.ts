import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RetainedOwnStayNotice, readCustomerStay, ClientFailure } from '@hsm/api-client';
import { browserClient } from './client';
// OUT-001 / ACC-004: keep the original command through current-link revalidation.
export function useOwnStayNotice(actorId: string, stayId: string, unavailable: boolean) {
  const cache = useQueryClient(),
    [command] = useState(() => new RetainedOwnStayNotice(stayId, () => crypto.randomUUID())),
    [refreshFailed, setRefreshFailed] = useState(false),
    queryKey = ['own-notice-authority', actorId, stayId];
  const authority = useQuery({
    queryKey,
    gcTime: 0,
    retry: false,
    enabled: !unavailable,
    queryFn: () => readCustomerStay(browserClient(), stayId),
  });
  const fresh =
      !unavailable &&
      !authority.isPending &&
      !authority.isFetching &&
      !authority.error &&
      Boolean(authority.data),
    eligible =
      authority.data?.state === 'active' &&
      authority.data.checkedInAt !== null &&
      authority.data.closedAt === null;
  const mutation = useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: (body: unknown) => {
      if (!fresh || (!command.uncertain && !eligible)) throw new ClientFailure('INVALID_RESPONSE');
      return command.submit(browserClient(), body);
    },
    onSuccess: async () => {
      const outcomes = await Promise.allSettled([
        cache.invalidateQueries({ queryKey: ['private-stays', actorId, 'own'] }),
        cache.invalidateQueries({ queryKey, exact: true }),
      ]);
      setRefreshFailed(outcomes.some((outcome) => outcome.status === 'rejected'));
    },
    onError: () => {
      void authority.refetch();
    },
  });
  return {
    authority,
    mutation,
    fresh,
    eligible,
    refreshFailed,
    visible: !unavailable && !authority.error && Boolean(authority.data),
    locked: command.locked,
    uncertain: command.uncertain,
    command: command.command,
    result: command.result,
  };
}
