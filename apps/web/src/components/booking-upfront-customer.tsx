'use client';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BookingUpfront } from '@hsm/contracts';
import {
  customerPaymentInstructions,
  marketplacePrice,
  submitBookingPaymentProof,
} from '@hsm/api-client';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { PrivateFileInput } from './private-file-input';
import { Button } from './ui/button';
export const upfrontLabels: Record<BookingUpfront['status'], string> = {
  awaiting_approval: 'Awaiting hostel approval before payment',
  awaiting_payment: 'Approved: pay the hostel directly, then submit your proof',
  verification_pending: 'Payment proof submitted: awaiting hostel verification',
  verified: 'Upfront payment verified by the hostel',
};
const requirementLabels: Record<BookingUpfront['requirement'], string> = {
  none: 'selected transport',
  deposit: 'security deposit',
  first_rent: 'first month rent',
  deposit_and_first_rent: 'security deposit and first month rent',
};
const methods = ['bank_transfer', 'jazzcash', 'easypaisa', 'cash', 'other'] as const;
function Instructions({ actorId, bookingId }: { actorId: string; bookingId: string }) {
  const query = useQuery({
    queryKey: ['booking-payment-instructions', actorId, bookingId],
    gcTime: 0,
    queryFn: () => customerPaymentInstructions(browserClient(), bookingId),
  });
  if (query.isPending) return <p role="status">Loading hostel payment instructions…</p>;
  if (query.isError)
    return (
      <div>
        <p role="alert">{errorMessage(query.error)}</p>
        <Button variant="secondary" onClick={() => void query.refetch()}>
          Retry payment instructions
        </Button>
      </div>
    );
  if (!query.data.data.length)
    return <p>The hostel has not published payment instructions. Message the hostel to ask.</p>;
  return (
    <ul className="space-y-1" aria-label="Hostel payment instructions">
      {query.data.data.map((row) => (
        <li key={row.id}>
          {row.method.replaceAll('_', ' ')}: {row.accountTitle} · {row.accountIdentifier}
          {row.instructions ? ' · ' + row.instructions : ''}
        </li>
      ))}
    </ul>
  );
}
// BKG-007/008: the customer pays the hostel directly; the platform only records the proof.
export function BookingUpfrontCustomer({
  actorId,
  bookingId,
  upfront,
  open,
}: {
  actorId: string;
  bookingId: string;
  upfront: BookingUpfront;
  open: boolean;
}) {
  const cache = useQueryClient(),
    keys = useRef(new Map<string, string>());
  const [fileId, setFileId] = useState<string>(),
    [method, setMethod] = useState<(typeof methods)[number]>('bank_transfer'),
    [paidOn, setPaidOn] = useState(''),
    [reference, setReference] = useState(''),
    [busy, setBusy] = useState(false);
  const submit = useMutation({
    gcTime: 0,
    mutationFn: (input: Record<string, unknown>) => {
      const command = JSON.stringify(input),
        key = keys.current.get(command) ?? crypto.randomUUID();
      keys.current.set(command, key);
      return submitBookingPaymentProof(browserClient(), bookingId, input, key);
    },
    onSuccess: async (_result, input) => {
      keys.current.delete(JSON.stringify(input));
      await cache.invalidateQueries({ queryKey: ['customer-bookings', actorId], exact: true });
    },
  });
  const proof = upfront.proof;
  return (
    <section className="space-y-3 rounded-input bg-customer-icy p-3" aria-label="Upfront payment">
      <p>
        Upfront {requirementLabels[upfront.requirement]}: {marketplacePrice(upfront.amountPaisa)}
      </p>
      <p>{upfrontLabels[upfront.status]}</p>
      {proof?.state === 'rejected' ? (
        <p role="alert">Previous proof not accepted: {proof.reviewReason}</p>
      ) : null}
      {proof && proof.state !== 'rejected' ? (
        <p>
          Submitted {marketplacePrice(proof.amountPaisa)} by {proof.method.replaceAll('_', ' ')} on{' '}
          {proof.paidOn}
        </p>
      ) : null}
      {open && upfront.status === 'awaiting_payment' ? (
        <>
          <Instructions actorId={actorId} bookingId={bookingId} />
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!fileId || !paidOn || submit.isPending) return;
              submit.mutate({
                fileId,
                amountPaisa: upfront.amountPaisa,
                method,
                paidOn,
                reference: reference.trim() || null,
              });
            }}
          >
            <PrivateFileInput
              id={'payment-proof-' + bookingId}
              label="Payment proof (screenshot or receipt)"
              purpose="payment_proof"
              disabled={submit.isPending}
              onReady={setFileId}
              onBusy={setBusy}
            />
            <label className="field-label" htmlFor={'payment-method-' + bookingId}>
              Payment method
            </label>
            <select
              id={'payment-method-' + bookingId}
              className="field-input"
              value={method}
              disabled={submit.isPending}
              onChange={(event) =>
                setMethod(methods.find((value) => value === event.target.value) ?? 'other')
              }
            >
              {methods.map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
            <label className="field-label" htmlFor={'payment-date-' + bookingId}>
              Payment date
            </label>
            <input
              id={'payment-date-' + bookingId}
              className="field-input"
              type="date"
              required
              value={paidOn}
              disabled={submit.isPending}
              onChange={(event) => setPaidOn(event.target.value)}
            />
            <label className="field-label" htmlFor={'payment-reference-' + bookingId}>
              Transaction reference (optional)
            </label>
            <input
              id={'payment-reference-' + bookingId}
              className="field-input"
              maxLength={120}
              value={reference}
              disabled={submit.isPending}
              onChange={(event) => setReference(event.target.value)}
            />
            {submit.isError ? <p role="alert">{errorMessage(submit.error)}</p> : null}
            <Button type="submit" disabled={!fileId || !paidOn || busy || submit.isPending}>
              {submit.isPending ? 'Submitting proof…' : 'Submit payment proof'}
            </Button>
            <p>A proof is not a payment confirmation. The hostel verifies it before confirming.</p>
          </form>
        </>
      ) : null}
    </section>
  );
}
