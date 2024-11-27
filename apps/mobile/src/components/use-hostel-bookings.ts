import { useRef } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import {
  ApiFailure,
  listHostelBookings,
  transitionHostelBooking,
  approveUpfrontBooking,
  reviewBookingPaymentProof,
  readInventoryAccess,
} from '@hsm/api-client';
import { bookingActionInputSchema } from '@hsm/contracts';
import { actorClient } from '../lib/runtime';
export type HostelBookingAction = 'confirm' | 'approve' | 'reject' | 'cancel';
type Command = { id: string; action: HostelBookingAction; reason: string };
type Page = Awaited<ReturnType<typeof listHostelBookings>>;
export function nativeScopeDenied(error: unknown) {
  return (
    error instanceof ApiFailure &&
    [
      'UNAUTHENTICATED',
      'TOKEN_EXPIRED',
      'SESSION_REVOKED',
      'ACCOUNT_SUSPENDED',
      'EMAIL_NOT_VERIFIED',
      'FORBIDDEN',
      'BRANCH_FORBIDDEN',
    ].includes(error.code)
  );
}
export function useHostelBookings(actorId: string, branchId: string, onSaved: () => void) {
  const cache = useQueryClient(),
    keys = useRef(new Map<string, string>()),
    queryKey = ['hostel-bookings', actorId, branchId],
    accessKey = ['inventory-access', actorId, branchId];
  const access = useQuery({
    queryKey: accessKey,
    gcTime: 0,
    queryFn: async () => readInventoryAccess(await actorClient(actorId), branchId),
  });
  const query = useInfiniteQuery({
    queryKey,
    gcTime: 0,
    initialPageParam: null,
    queryFn: async ({ pageParam }: { pageParam: string | null }) =>
      listHostelBookings(await actorClient(actorId), branchId, {
        limit: 20,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor,
  });
  const action = useMutation({
    gcTime: 0,
    mutationFn: async (input: Command) => {
      const reason = bookingActionInputSchema.parse({ reason: input.reason }).reason,
        command = JSON.stringify({ ...input, reason }),
        key = keys.current.get(command) ?? randomUUID();
      keys.current.set(command, key);
      // SRS v2.11: upfront requests are approved for payment, never confirmed directly.
      if (input.action === 'approve')
        return approveUpfrontBooking(await actorClient(actorId), branchId, input.id, reason, key);
      return transitionHostelBooking(
        await actorClient(actorId),
        branchId,
        input.id,
        input.action,
        reason,
        key,
      );
    },
    onError: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey, exact: true }),
        cache.invalidateQueries({ queryKey: accessKey, exact: true }),
      ]);
    },
    onSuccess: async (result, input) => {
      keys.current.delete(JSON.stringify({ ...input, reason: input.reason.trim() }));
      cache.setQueryData<InfiniteData<Page>>(queryKey, (current) =>
        current
          ? {
              ...current,
              pages: current.pages.map((page) => ({
                ...page,
                data: page.data.map((row) => (row.id === result.id ? result : row)),
              })),
            }
          : current,
      );
      onSaved();
      await Promise.all([
        cache.invalidateQueries({ queryKey, exact: true }),
        cache.invalidateQueries({ queryKey: accessKey, exact: true }),
      ]);
    },
  });
  const review = useMutation({
    gcTime: 0,
    mutationFn: async (input: {
      id: string;
      proofId: string;
      review: { decision: 'approve' } | { decision: 'reject'; reason: string };
    }) => {
      const command = JSON.stringify(input),
        key = keys.current.get(command) ?? randomUUID();
      keys.current.set(command, key);
      return reviewBookingPaymentProof(
        await actorClient(actorId),
        branchId,
        input.id,
        input.proofId,
        input.review,
        key,
      );
    },
    onSuccess: async (_result, input) => {
      keys.current.delete(JSON.stringify(input));
      onSaved();
      await cache.invalidateQueries({ queryKey, exact: true });
    },
    onError: async () => {
      await cache.invalidateQueries({ queryKey: accessKey, exact: true });
    },
  });
  return { access, query, action, review };
}
