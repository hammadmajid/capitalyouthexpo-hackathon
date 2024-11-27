import { stayWorkspaceKeys } from '../lib/stay-workspace-keys';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  RetainedStayPayment,
  ClientFailure,
  readInventoryAccess,
  readStaffStay,
  readStaffStayReceipt,
} from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import { randomUUID } from 'expo-crypto';
// PAY-008 / SEC-003: UI grants are a convenience; the mutation rechecks live
// actor, branch, exact Stay/account link and both grants inside its transaction.
export function useStaffStayPayment(
  actorId: string,
  branchId: string,
  stayId: string,
  unavailable: boolean,
) {
  const cache = useQueryClient(),
    [command] = useState(() => new RetainedStayPayment(branchId, stayId, randomUUID)),
    [refreshFailed, setRefreshFailed] = useState(false),
    queryKey = ['payment-authority', actorId, branchId, stayId];
  const authority = useQuery({
    queryKey,
    gcTime: 0,
    retry: false,
    enabled: !unavailable,
    queryFn: async () => {
      const client = await actorClient(actorId);
      const [access, stay] = await Promise.all([
        readInventoryAccess(client, branchId),
        readStaffStay(client, branchId, stayId),
      ]);
      return { access, stay };
    },
  });
  const fresh =
    !unavailable &&
    !authority.isPending &&
    !authority.isFetching &&
    !authority.error &&
    (['finance_view', 'payment_record'] as const).every((grant) =>
      authority.data?.access.permissions.includes(grant),
    );
  const mutation = useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: async (body: unknown) => {
      if (!fresh) throw new ClientFailure('INVALID_RESPONSE');
      return command.submit(await actorClient(actorId), body);
    },
    onSuccess: async () => {
      const results = await Promise.allSettled([
        ...stayWorkspaceKeys(actorId, branchId).map((queryKey) =>
          cache.invalidateQueries({ queryKey }),
        ),
        cache.invalidateQueries({ queryKey, exact: true }),
        cache.invalidateQueries({ queryKey: ['branch-transport', actorId, branchId] }),
      ]);
      setRefreshFailed(results.some((result) => result.status === 'rejected'));
    },
    onError: () => {
      void authority.refetch();
    },
  });
  const result = command.result,
    receiptId = result?.receiptId;
  const receipt = useQuery({
    queryKey: ['private-receipts', actorId, branchId, stayId, receiptId],
    gcTime: 0,
    retry: false,
    enabled: fresh && receiptId !== undefined,
    queryFn: async () => {
      if (!result) throw new ClientFailure('INVALID_RESPONSE');
      const value = await readStaffStayReceipt(
        await actorClient(actorId),
        branchId,
        stayId,
        result.receiptId,
      );
      if (
        value.snapshot.paymentId !== result.paymentId ||
        value.receiptNumber !== result.receiptNumber ||
        value.snapshot.amountPaisa !== result.amountPaisa
      )
        throw new ClientFailure('INVALID_RESPONSE');
      return value;
    },
  });
  return {
    authority,
    mutation,
    receipt,
    fresh,
    refreshFailed,
    locked: command.locked,
    uncertain: command.uncertain,
    command: command.command,
    result: command.result,
  };
}
