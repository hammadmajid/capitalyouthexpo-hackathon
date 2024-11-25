'use client';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BillingAgreementTerms } from '@hsm/contracts';
import { checkInBooking, marketplacePrice, previewBookingCheckIn } from '@hsm/api-client';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
import { CnicInput, cnicComplete } from './cnic-input';
// RENT-003: initial billing starts at the first period for rent and every disclosed fee.
export function checkInBilling(terms: BillingAgreementTerms) {
  return [
    { item: 'rent' as const, cadence: 'periodic' as const, periodIndex: 0 },
    ...terms.fees.map((fee) => ({
      item: fee.code,
      cadence: fee.cadence === 'monthly' ? ('periodic' as const) : ('one_time' as const),
      periodIndex: 0,
    })),
  ];
}
// STAY-001 / BKG-004: check in a confirmed booking with exactly its captured terms.
export function BookingCheckIn({
  actorId,
  branchId,
  bookingId,
}: {
  actorId: string;
  branchId: string;
  bookingId: string;
}) {
  const cache = useQueryClient(),
    keys = useRef(new Map<string, string>()),
    [open, setOpen] = useState(false),
    [cnic, setCnic] = useState('');
  const preview = useQuery({
    queryKey: ['booking-check-in', actorId, branchId, bookingId],
    enabled: open,
    gcTime: 0,
    retry: false,
    queryFn: () => previewBookingCheckIn(browserClient(), branchId, bookingId),
  });
  const submit = useMutation({
    gcTime: 0,
    mutationFn: (terms: BillingAgreementTerms) => {
      const body = {
          policyVersionId: terms.policyVersionId,
          initialBilling: checkInBilling(terms),
          // CHG-054: typed only when the customer's account has no CNIC on file.
          ...(cnicComplete(cnic) ? { cnic } : {}),
        },
        intent = JSON.stringify(body),
        key = keys.current.get(intent) ?? crypto.randomUUID();
      keys.current.set(intent, key);
      return checkInBooking(browserClient(), branchId, bookingId, body, key);
    },
    onSuccess: () => keys.current.clear(),
    // A stale or repeated check-in (409) refreshes the list so the linked Stay replaces it.
    onSettled: () => cache.invalidateQueries({ queryKey: ['hostel-bookings', actorId, branchId] }),
  });
  if (!open)
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Check in resident
      </Button>
    );
  if (submit.data)
    return (
      <section aria-label="Check-in complete" className="space-y-1">
        <p role="status">Resident checked in. The booking is now an active Stay.</p>
        <p className="break-all text-sm">Stay reference: {submit.data.stayId}</p>
      </section>
    );
  const terms = preview.data?.terms,
    needsCnic = preview.data?.cnicOnFile === false;
  return (
    <section aria-label="Booking check-in" className="space-y-2">
      <h4 className="font-semibold">Check in this booking</h4>
      {preview.isPending ? <p role="status">Loading agreement terms…</p> : null}
      {preview.isError ? <p role="alert">{errorMessage(preview.error)}</p> : null}
      {terms ? (
        <>
          <p>Agreed monthly rent: {marketplacePrice(terms.rentAmountPaisa)}</p>
          <p>Security deposit: {marketplacePrice(terms.depositPaisa)}</p>
          {terms.fees.map((fee) => (
            <p key={fee.code + ':' + fee.cadence}>
              {fee.code}: {marketplacePrice(fee.amountPaisa)} (
              {fee.cadence === 'monthly' ? 'monthly' : 'one time'})
            </p>
          ))}
          <p>
            Billing: {terms.policy.cycle.kind.replaceAll('_', ' ')}, notice{' '}
            {terms.policy.noticeDays} days. Initial charges start with the first billing period.
          </p>
          <p>These are the booking&apos;s captured terms; later price changes do not apply.</p>
          {needsCnic ? (
            <CnicInput
              id={'check-in-cnic-' + bookingId}
              value={cnic}
              onChange={setCnic}
              disabled={submit.isPending}
            />
          ) : (
            <p>CNIC on file from the customer&apos;s account.</p>
          )}
          {submit.isError ? <p role="alert">{errorMessage(submit.error)}</p> : null}
          <Button
            disabled={submit.isPending || (needsCnic && !cnicComplete(cnic))}
            onClick={() => submit.mutate(terms)}
          >
            {submit.isPending ? 'Checking in…' : 'Confirm check-in'}
          </Button>
        </>
      ) : null}
      <Button variant="ghost" disabled={submit.isPending} onClick={() => setOpen(false)}>
        Cancel check-in
      </Button>
    </section>
  );
}
