'use client';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProofReviewInput } from '@hsm/contracts';
import {
  branchPaymentProofQueue,
  marketplacePrice,
  readInventoryAccess,
  reviewStayPaymentProof,
  stayPaymentProofLink,
} from '@hsm/api-client';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { refreshDashboardCounts } from '../lib/dashboard-refresh';
import { Button } from './ui/button';
export function PaymentReview(props: { actorId: string; branchId: string; initialOpen?: boolean }) {
  return <Queue key={props.actorId + ':' + props.branchId} {...props} />;
}
// PAY-004..007: staff verify resident proofs against the invoice's server-side balance.
function Queue({
  actorId,
  branchId,
  initialOpen = false,
}: {
  actorId: string;
  branchId: string;
  initialOpen?: boolean;
}) {
  const cache = useQueryClient(),
    keys = useRef(new Map<string, string>());
  const [open, setOpen] = useState(initialOpen),
    [cursor, setCursor] = useState<string>(),
    [rejecting, setRejecting] = useState<string>(),
    [reason, setReason] = useState('');
  const access = useQuery({
    queryKey: ['inventory-access', actorId, branchId],
    gcTime: 0,
    queryFn: () => readInventoryAccess(browserClient(), branchId),
  });
  const queue = useQuery({
    queryKey: ['payment-proof-queue', actorId, branchId, cursor],
    enabled: open,
    gcTime: 0,
    retry: false,
    queryFn: () =>
      branchPaymentProofQueue(browserClient(), branchId, {
        state: 'submitted',
        ...(cursor ? { cursor } : {}),
      }),
  });
  const review = useMutation({
    gcTime: 0,
    mutationFn: (input: { proofId: string; decision: ProofReviewInput }) => {
      const command = JSON.stringify(input),
        key = keys.current.get(command) ?? crypto.randomUUID();
      keys.current.set(command, key);
      return reviewStayPaymentProof(browserClient(), branchId, input.proofId, input.decision, key);
    },
    // A stale queue (already reviewed elsewhere) is refreshed on any outcome.
    onSettled: async () => {
      setRejecting(undefined);
      setReason('');
      await cache.invalidateQueries({ queryKey: ['payment-proof-queue', actorId, branchId] });
      await cache.invalidateQueries({ queryKey: ['rent-board', actorId, branchId] });
      await refreshDashboardCounts(cache, actorId, branchId);
    },
  });
  const permissions = access.data?.permissions ?? [];
  if (!permissions.includes('finance_view')) return null;
  const canDecide = permissions.includes('payment_record');
  if (!open)
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Review payment proofs
      </Button>
    );
  return (
    <section aria-label="Payment proof review" className="space-y-3">
      <h2 className="text-xl font-semibold">Payment proofs awaiting review</h2>
      {!canDecide ? <p>Your role can view proofs. Approving needs the payment grant.</p> : null}
      {queue.isPending ? <p role="status">Loading payment proofs…</p> : null}
      {queue.isError ? <p role="alert">{errorMessage(queue.error)}</p> : null}
      {review.isError ? <p role="alert">{errorMessage(review.error)}</p> : null}
      {review.isSuccess ? (
        <p role="status">
          {review.data.state === 'approved'
            ? 'Payment recorded and receipt issued.'
            : 'Proof rejected; the invoice remains unpaid.'}
        </p>
      ) : null}
      {queue.data?.data.length === 0 ? <p>No proofs are waiting.</p> : null}
      <ul className="space-y-3">
        {queue.data?.data.map((row) => (
          <li key={row.proof.id} className="rounded-input border border-hsm-border p-3">
            <p className="font-medium">
              {row.residentName}
              {row.roomLabel ? ' · Room ' + row.roomLabel : ''}
              {row.bedLabel ? ', Bed ' + row.bedLabel : ''}
            </p>
            <p>
              {row.proof.invoiceNumber}: submitted {marketplacePrice(row.proof.amountPaisa)} by{' '}
              {row.proof.method.replaceAll('_', ' ')} on {row.proof.paidOn}
              {row.proof.reference ? ' · ref ' + row.proof.reference : ''}
            </p>
            <p>Invoice outstanding: {marketplacePrice(row.invoiceOutstandingPaisa)}</p>
            {(row.proof.depositPaisa ?? 0) > 0 ? (
              <p>
                Security: {marketplacePrice(row.proof.depositPaisa ?? 0)} · remaining agreed{' '}
                {marketplacePrice(row.depositOutstandingPaisa ?? 0)}
              </p>
            ) : null}
            {row.amountMismatch ? (
              <p role="alert">
                Amount differs from the outstanding balance. A smaller amount is a partial payment;
                amounts above selected bills plus security cannot be approved.
              </p>
            ) : null}
            <Button
              variant="secondary"
              onClick={async () => {
                const link = await stayPaymentProofLink(browserClient(), branchId, row.proof.id);
                window.open(link.url, '_blank', 'noopener');
              }}
            >
              Open proof for {row.residentName}
            </Button>
            {canDecide ? (
              <>
                <Button
                  disabled={review.isPending}
                  onClick={() =>
                    review.mutate({ proofId: row.proof.id, decision: { decision: 'approve' } })
                  }
                >
                  Approve payment for {row.residentName}
                </Button>
                {rejecting === row.proof.id ? (
                  <>
                    <label className="field-label">
                      Rejection reason
                      <input
                        aria-label="Rejection reason"
                        className="field-input"
                        maxLength={500}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                      />
                    </label>
                    <Button
                      variant="secondary"
                      disabled={!reason.trim() || review.isPending}
                      onClick={() =>
                        review.mutate({
                          proofId: row.proof.id,
                          decision: { decision: 'reject', reason: reason.trim() },
                        })
                      }
                    >
                      Confirm rejection
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" onClick={() => setRejecting(row.proof.id)}>
                    Reject proof for {row.residentName}
                  </Button>
                )}
              </>
            ) : null}
          </li>
        ))}
      </ul>
      {queue.data?.nextCursor ? (
        <Button variant="secondary" onClick={() => setCursor(queue.data.nextCursor ?? undefined)}>
          More proofs
        </Button>
      ) : null}
      <Button variant="ghost" onClick={() => setOpen(false)}>
        Close payment proofs
      </Button>
    </section>
  );
}
