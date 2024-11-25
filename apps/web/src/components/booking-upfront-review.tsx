'use client';
import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BookingUpfront } from '@hsm/contracts';
import {
  bookingPaymentProofLink,
  marketplacePrice,
  reviewBookingPaymentProof,
} from '@hsm/api-client';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { refreshBookingViews } from '../lib/dashboard-refresh';
import { Button } from './ui/button';
// ACC-004 / BKG-008: staff compare the proof with their own records; approval confirms.
export function BookingUpfrontReview({
  actorId,
  branchId,
  bookingId,
  upfront,
  canReview,
}: {
  actorId: string;
  branchId: string;
  bookingId: string;
  upfront: BookingUpfront;
  canReview: boolean;
}) {
  const cache = useQueryClient(),
    keys = useRef(new Map<string, string>());
  const [rejecting, setRejecting] = useState(false),
    [reason, setReason] = useState(''),
    [linkError, setLinkError] = useState<unknown>();
  const proof = upfront.proof;
  const review = useMutation({
    gcTime: 0,
    mutationFn: (input: { decision: 'approve' } | { decision: 'reject'; reason: string }) => {
      if (!proof) throw new Error('Proof unavailable');
      const command = JSON.stringify(input),
        key = keys.current.get(command) ?? crypto.randomUUID();
      keys.current.set(command, key);
      return reviewBookingPaymentProof(browserClient(), branchId, bookingId, proof.id, input, key);
    },
    onSuccess: async (_result, input) => {
      keys.current.delete(JSON.stringify(input));
      setRejecting(false);
      setReason('');
      await refreshBookingViews(cache, actorId, branchId);
    },
  });
  return (
    <section className="space-y-2" aria-label="Upfront payment verification">
      <p>
        Upfront{' '}
        {upfront.requirement === 'none'
          ? 'selected transport'
          : upfront.requirement.replaceAll('_', ' ')}
        : {marketplacePrice(upfront.amountPaisa)} · {upfront.status.replaceAll('_', ' ')}
      </p>
      {proof ? (
        <p>
          Proof {proof.state}: {marketplacePrice(proof.amountPaisa)} by{' '}
          {proof.method.replaceAll('_', ' ')} on {proof.paidOn}
          {proof.reference ? ' · reference ' + proof.reference : ''}
          {proof.reviewReason ? ' · ' + proof.reviewReason : ''}
        </p>
      ) : null}
      {canReview && proof?.state === 'submitted' && upfront.status === 'verification_pending' ? (
        <div className="space-y-2">
          <Button
            variant="secondary"
            onClick={() => {
              setLinkError(undefined);
              bookingPaymentProofLink(browserClient(), branchId, bookingId, proof.id)
                .then((link) => window.open(link.url, '_blank', 'noopener,noreferrer'))
                .catch(setLinkError);
            }}
          >
            Open payment proof
          </Button>
          {linkError ? <p role="alert">{errorMessage(linkError)}</p> : null}
          <p>Approve only after the money appears in your own hostel account.</p>
          {review.isError ? <p role="alert">{errorMessage(review.error)}</p> : null}
          {rejecting ? (
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (reason.trim() && !review.isPending)
                  review.mutate({ decision: 'reject', reason: reason.trim() });
              }}
            >
              <label className="field-label" htmlFor={'proof-reason-' + proof.id}>
                Reason the proof was not accepted
              </label>
              <textarea
                id={'proof-reason-' + proof.id}
                className="field-input"
                maxLength={500}
                required
                value={reason}
                disabled={review.isPending}
                onChange={(event) => setReason(event.target.value)}
              />
              <Button type="submit" disabled={!reason.trim() || review.isPending}>
                Reject payment proof
              </Button>
              <Button type="button" variant="ghost" onClick={() => setRejecting(false)}>
                Keep proof pending
              </Button>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={review.isPending}
                onClick={() => review.mutate({ decision: 'approve' })}
              >
                {review.isPending ? 'Verifying…' : 'Verify payment and confirm booking'}
              </Button>
              <Button variant="secondary" onClick={() => setRejecting(true)}>
                Reject proof
              </Button>
            </div>
          )}
        </div>
      ) : null}
      {!canReview && upfront.status === 'verification_pending' ? (
        <p>Verifying payments requires booking, payment-record and finance-view grants.</p>
      ) : null}
    </section>
  );
}
