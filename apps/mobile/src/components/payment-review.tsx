import { useToolOpen } from './inventory-tools';
import { stayWorkspaceKeys } from '../lib/stay-workspace-keys';
import { AppHeader } from './navigation/header';
import { useOwnerScreenBack } from './owner-screen-back';
import { PaymentProofPreview } from './payment-proof-preview';
import { PaymentDecision } from './payment-decision';
import { StayReceipt } from './stay-receipt';
import { Skeleton } from './loading/skeleton';
import { useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import type { ProofReviewInput } from '@hsm/contracts';
import { branchPaymentProofQueue, marketplacePrice, reviewStayPaymentProof } from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { proofBills } from '../lib/proof-bills';
import { Copy } from './ui';
import { MarketplaceAction as Button } from './marketplace/action';
// PAY-004..007: mounted for finance_view; approving also needs payment_record (server-checked).
export function NativePaymentReview(props: {
  actorId: string;
  branchId: string;
  canDecide: boolean;
  stayId?: string | undefined;
  initiallyOpen?: boolean;
  onClose?: (() => void) | undefined;
}) {
  const { actorId, branchId, canDecide } = props;
  const cache = useQueryClient(),
    keys = useRef(new Map<string, string>());
  const [open, setOpen] = useToolOpen(props.initiallyOpen ?? false),
    [preview, setPreview] = useState<string>(),
    [cursor, setCursor] = useState<string>(),
    [rejecting, setRejecting] = useState<string>(),
    [reason, setReason] = useState('');
  const queue = useQuery({
    queryKey: ['payment-proof-queue', actorId, branchId, props.stayId, cursor],
    enabled: open,
    gcTime: 0,
    retry: false,
    queryFn: async () =>
      branchPaymentProofQueue(await actorClient(actorId), branchId, {
        state: 'submitted',
        ...(props.stayId ? { stayId: props.stayId } : {}),
        ...(cursor ? { cursor } : {}),
      }),
  });
  const review = useMutation({
    gcTime: 0,
    mutationFn: async (input: { proofId: string; decision: ProofReviewInput }) => {
      const command = JSON.stringify(input),
        key = keys.current.get(command) ?? randomUUID();
      keys.current.set(command, key);
      return reviewStayPaymentProof(
        await actorClient(actorId),
        branchId,
        input.proofId,
        input.decision,
        key,
      );
    },
    onSuccess: async () => {
      setPreview(undefined);
      await Promise.allSettled(
        stayWorkspaceKeys(actorId, branchId).map((queryKey) =>
          cache.invalidateQueries({ queryKey }),
        ),
      );
    },
    onSettled: async () => {
      setRejecting(undefined);
      setReason('');
      await cache.invalidateQueries({ queryKey: ['payment-proof-queue', actorId, branchId] });
    },
  });
  const close = () => {
    if (!review.isPending) {
      if (props.onClose) props.onClose();
      else setOpen(false);
    }
  };
  useOwnerScreenBack(close, open, 5);
  if (!open)
    return <Button secondary label="Review payment proofs" onPress={() => setOpen(true)} />;
  return (
    <View className="gap-2" accessibilityLabel="Payment proof review">
      <AppHeader
        title="Payment proofs"
        backLabel="Close payment proofs"
        onBack={close}
        backDisabled={review.isPending}
      />
      {queue.isPending ? <Skeleton kind="list" label="Loading payment proofs…" /> : null}
      {queue.isError ? <Copy alert>{safeMessage(queue.error)}</Copy> : null}
      {review.isError ? <Copy alert>{safeMessage(review.error)}</Copy> : null}
      {review.isSuccess ? (
        <View className="gap-3">
          <PaymentDecision
            key={review.data.id + review.data.state}
            approved={review.data.state === 'approved'}
          />
          {review.data.state === 'approved' && review.data.receiptId ? (
            <StayReceipt
              actorId={actorId}
              branchId={branchId}
              stayId={review.data.stayId}
              receiptId={review.data.receiptId}
            />
          ) : null}
        </View>
      ) : null}
      {queue.data?.data.length === 0 ? <Copy>No proofs waiting</Copy> : null}
      {!queue.isError &&
        queue.data?.data.map((row) => (
          <View key={row.proof.id} className="gap-1">
            <Copy>
              {row.residentName}
              {row.roomLabel ? ' · Room ' + row.roomLabel : ''} · {proofBills(row.proof)}:{' '}
              {marketplacePrice(row.proof.amountPaisa)} (outstanding{' '}
              {marketplacePrice(row.invoiceOutstandingPaisa)})
            </Copy>
            {(row.proof.depositPaisa ?? 0) > 0 ? (
              <Copy>
                Security: {marketplacePrice(row.proof.depositPaisa ?? 0)} · remaining agreed{' '}
                {marketplacePrice(row.depositOutstandingPaisa ?? 0)}
              </Copy>
            ) : null}
            {row.amountMismatch ? (
              <Copy alert>Amount differs from the outstanding balance.</Copy>
            ) : null}
            <Button
              secondary
              label={'Open proof for ' + row.residentName}
              onPress={() => setPreview(preview === row.proof.id ? undefined : row.proof.id)}
            />
            {preview === row.proof.id || props.initiallyOpen ? (
              <PaymentProofPreview
                key={row.proof.id}
                actorId={actorId}
                branchId={branchId}
                proofId={row.proof.id}
              />
            ) : null}
            {canDecide ? (
              <>
                <Button
                  label={'Approve payment for ' + row.residentName}
                  disabled={review.isPending}
                  onPress={() =>
                    review.mutate({ proofId: row.proof.id, decision: { decision: 'approve' } })
                  }
                />
                {rejecting === row.proof.id ? (
                  <>
                    <TextInput
                      accessibilityLabel="Rejection reason"
                      placeholder="Rejection reason"
                      value={reason}
                      onChangeText={setReason}
                      maxLength={500}
                      className="min-h-12 rounded-input border border-border bg-inputSurface px-4 py-3 font-body text-body text-text"
                    />
                    <Button
                      secondary
                      label="Confirm rejection"
                      disabled={!reason.trim() || review.isPending}
                      onPress={() =>
                        review.mutate({
                          proofId: row.proof.id,
                          decision: { decision: 'reject', reason: reason.trim() },
                        })
                      }
                    />
                  </>
                ) : (
                  <Button
                    secondary
                    label={'Reject proof for ' + row.residentName}
                    onPress={() => setRejecting(row.proof.id)}
                  />
                )}
              </>
            ) : null}
          </View>
        ))}
      {queue.data?.nextCursor ? (
        <Button
          secondary
          label="More pending invoices"
          onPress={() => setCursor(queue.data?.nextCursor ?? undefined)}
        />
      ) : null}
      {cursor ? (
        <Button secondary label="First pending invoices" onPress={() => setCursor(undefined)} />
      ) : null}
    </View>
  );
}
