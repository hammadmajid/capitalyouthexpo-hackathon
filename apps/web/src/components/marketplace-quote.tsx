'use client';
import { useEffect, useState } from 'react';
import { MarketplaceCheckoutGate } from './marketplace-checkout-gate';
import { useMutation } from '@tanstack/react-query';
import { requestBookingQuote, marketplacePrice } from '@hsm/api-client';
import { quoteInputSchema, type InventoryTarget, type StayRange } from '@hsm/contracts';
import { marketplaceColors as colors, marketplaceMetrics as metrics } from '@hsm/ui';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
const documentLabels = {
  cnic: 'CNIC',
  student_id: 'Student ID',
  admission_proof: 'Admission proof',
  employment_proof: 'Employment proof',
};
export function MarketplaceQuote({
  branchId,
  target,
  onBusy,
  initialRange,
}: {
  branchId: string;
  target: InventoryTarget;
  initialRange?: StayRange;
  onBusy?: ((busy: boolean) => void) | undefined;
}) {
  const [moveIn, setMoveIn] = useState(initialRange?.moveInDate ?? ''),
    [moveOut, setMoveOut] = useState(initialRange?.moveOutDate ?? '');
  const [transportRequested, setTransportRequested] = useState(false);
  const [invalid, setInvalid] = useState(false),
    [checkoutBusy, setCheckoutBusy] = useState(false);
  useEffect(() => {
    onBusy?.(checkoutBusy);
    return () => onBusy?.(false);
  }, [checkoutBusy, onBusy]);
  const quote = useMutation({
    mutationFn: (selected: boolean) =>
      requestBookingQuote(
        browserClient(),
        branchId,
        quoteInputSchema.parse({
          target,
          ...(selected ? { transportRequested: true } : {}),
          range: { moveInDate: moveIn, moveOutDate: moveOut },
        }),
      ),
  });
  function change(update: (value: string) => void, value: string) {
    if (checkoutBusy) return;
    quote.reset();
    setInvalid(false);
    update(value);
  }
  return (
    <section
      style={{
        padding: metrics.lg,
        border: `1px solid ${colors.border}`,
        borderRadius: metrics.card,
      }}
    >
      <h2>Check current terms</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const input = quoteInputSchema.safeParse({
            target,
            range: { moveInDate: moveIn, moveOutDate: moveOut },
          });
          setInvalid(!input.success);
          if (input.success && !quote.isPending && !checkoutBusy) quote.mutate(transportRequested);
        }}
        style={{ display: 'grid', gap: metrics.md }}
      >
        <label>
          Move-in date
          <input
            type="date"
            value={moveIn}
            disabled={quote.isPending || checkoutBusy}
            onChange={(event) => change(setMoveIn, event.target.value)}
            style={{ minHeight: metrics.touch }}
          />
        </label>
        <label>
          Move-out date
          <input
            type="date"
            value={moveOut}
            disabled={quote.isPending || checkoutBusy}
            onChange={(event) => change(setMoveOut, event.target.value)}
            style={{ minHeight: metrics.touch }}
          />
        </label>
        {invalid ? <p role="alert">Choose valid ordered stay dates.</p> : null}
        <button
          type="submit"
          disabled={quote.isPending || checkoutBusy}
          style={{
            minHeight: metrics.touch,
            backgroundColor: colors.primary,
            color: colors.surface,
            borderRadius: metrics.pill,
            padding: metrics.md,
          }}
        >
          {quote.isPending ? 'Checking terms…' : 'Check availability and terms'}
        </button>
      </form>
      {quote.data?.transportOffer ? (
        <label>
          <input
            type="checkbox"
            checked={transportRequested}
            disabled={quote.isPending || checkoutBusy}
            onChange={(event) => {
              setTransportRequested(event.target.checked);
              quote.mutate(event.target.checked);
            }}
          />
          Add transport - {marketplacePrice(quote.data.transportOffer.monthlyChargePaisa)}/month.
          First month is added to upfront.
        </label>
      ) : null}
      {quote.isError ? <p role="alert">{errorMessage(quote.error)}</p> : null}
      {quote.data && !quote.isPending ? (
        <div>
          <h3>Current booking terms</h3>
          <p>
            Room {quote.data.listing.roomLabel}
            {quote.data.listing.bedLabel ? ', bed ' + quote.data.listing.bedLabel : ''}
          </p>
          <p>Monthly rent: {marketplacePrice(quote.data.price.monthlyRentPaisa)}</p>
          {quote.data.includedTransport?.map((route) => (
            <p key={route.id}>Included in rent: {route.name}</p>
          ))}
          <p>Deposit: {marketplacePrice(quote.data.price.depositPaisa)}</p>
          {quote.data.price.fees.map((fee) => (
            <p key={fee.code + fee.cadence}>
              {fee.code}: {marketplacePrice(fee.amountPaisa)} (
              {fee.cadence === 'monthly' ? 'monthly' : 'one time'})
            </p>
          ))}
          <p>
            {quote.data.policy.bookingMode === 'instant'
              ? 'Instant confirmation when requirements are met'
              : 'Hostel approval required'}
          </p>
          <p>
            Required documents:{' '}
            {quote.data.policy.requiredDocuments.map((kind) => documentLabels[kind]).join(', ') ||
              'None'}
          </p>
          <p>Requesting a quote alone does not hold inventory or create a booking.</p>
          <MarketplaceCheckoutGate
            branchId={branchId}
            quote={quote.data}
            onBusy={setCheckoutBusy}
          />
        </div>
      ) : null}
    </section>
  );
}
