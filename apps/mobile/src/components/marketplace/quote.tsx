import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { requestBookingQuote, marketplacePrice } from '@hsm/api-client';
import { quoteInputSchema, type InventoryTarget, type StayRange } from '@hsm/contracts';
import { mobileMarketplaceColors as colors, marketplaceMetrics as metrics } from '@hsm/ui';
import { client } from '../../lib/runtime';
import { safeMessage } from '../../lib/messages';
import { MarketplaceCheckout } from './checkout';
import { DateField } from '../date-field';
import { MarketplaceAction } from './action';
export function MarketplaceQuote({
  branchId,
  target,
  actorId,
  initialRange,
  onBusy,
}: {
  branchId: string;
  target: InventoryTarget;
  actorId?: string;
  initialRange?: StayRange;
  onBusy?: (busy: boolean) => void;
}) {
  const [moveIn, setMoveIn] = useState(initialRange?.moveInDate ?? ''),
    [moveOut, setMoveOut] = useState(initialRange?.moveOutDate ?? '');
  const [transportRequested, setTransportRequested] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const quote = useMutation({
    mutationFn: (selected: boolean) =>
      requestBookingQuote(
        client,
        branchId,
        quoteInputSchema.parse({
          target,
          ...(selected ? { transportRequested: true } : {}),
          range: { moveInDate: moveIn, moveOutDate: moveOut },
        }),
      ),
  });
  useEffect(() => {
    onBusy?.(quote.isPending || checkoutBusy);
    return () => onBusy?.(false);
  }, [quote.isPending, checkoutBusy, onBusy]);
  function request() {
    const valid = quoteInputSchema.safeParse({
      target,
      range: { moveInDate: moveIn, moveOutDate: moveOut },
    });
    setInvalid(!valid.success);
    if (valid.success && !quote.isPending && !checkoutBusy) quote.mutate(transportRequested);
  }
  function change(update: (value: string) => void, value: string) {
    if (quote.isPending || checkoutBusy) return;
    quote.reset();
    setInvalid(false);
    update(value);
  }
  return (
    <View style={{ gap: metrics.md }}>
      {[
        { label: 'Quote move-in date', value: moveIn, update: setMoveIn },
        { label: 'Quote move-out date', value: moveOut, update: setMoveOut },
      ].map((field) => (
        <View key={field.label} style={{ gap: metrics.xs }}>
          <DateField
            label={field.label}
            value={field.value}
            onChange={(value) => change(field.update, value)}
            disabled={quote.isPending || checkoutBusy}
          />
        </View>
      ))}
      {invalid ? (
        <Text accessibilityRole="alert" style={{ color: colors.error }}>
          Choose valid ordered stay dates.
        </Text>
      ) : null}
      <MarketplaceAction
        label={quote.isPending ? 'Checking terms…' : 'Check availability and terms'}
        disabled={quote.isPending || checkoutBusy}
        onPress={request}
      />
      {quote.isError ? (
        <Text accessibilityRole="alert" style={{ color: colors.error }}>
          {safeMessage(quote.error)}
        </Text>
      ) : null}
      {quote.data && !quote.isPending ? (
        <View style={{ gap: metrics.sm }}>
          <Text style={{ color: colors.heading, fontFamily: 'PlusJakartaSans_700Bold' }}>
            Current booking terms
          </Text>
          <Text style={{ color: colors.heading }}>
            Room {quote.data.listing.roomLabel}
            {quote.data.listing.bedLabel ? ', bed ' + quote.data.listing.bedLabel : ''}
          </Text>
          <Text style={{ color: colors.primary }}>
            Monthly rent: {marketplacePrice(quote.data.price.monthlyRentPaisa)}
          </Text>
          {quote.data.transportOffer ? (
            <MarketplaceAction
              label={
                (transportRequested ? 'Remove transport' : 'Add transport') +
                ' - ' +
                marketplacePrice(quote.data.transportOffer.monthlyChargePaisa) +
                '/month'
              }
              disabled={quote.isPending || checkoutBusy}
              onPress={() => {
                setTransportRequested(!transportRequested);
                quote.mutate(!transportRequested);
              }}
            />
          ) : null}
          {transportRequested && quote.data.transportOffer ? (
            <Text style={{ color: colors.secondary }}>
              Transport selected for booking. First month transport is included in the upfront
              total.
            </Text>
          ) : null}
          {quote.data.includedTransport?.map((route) => (
            <Text key={route.id} style={{ color: colors.secondary }}>
              Included in rent: {route.name}
            </Text>
          ))}
          <Text style={{ color: colors.secondary }}>
            Deposit: {marketplacePrice(quote.data.price.depositPaisa)}
          </Text>
          {quote.data.price.fees.map((fee) => (
            <Text key={fee.code + fee.cadence} style={{ color: colors.secondary }}>
              {fee.code}: {marketplacePrice(fee.amountPaisa)} (
              {fee.cadence === 'monthly' ? 'monthly' : 'one time'})
            </Text>
          ))}
          <Text style={{ color: colors.secondary }}>
            Booking mode:{' '}
            {quote.data.policy.bookingMode === 'instant'
              ? 'Instant confirmation when requirements are met'
              : 'Hostel approval required'}
          </Text>
          <Text style={{ color: colors.secondary }}>
            Required documents:{' '}
            {quote.data.policy.requiredDocuments
              .map(
                (kind) =>
                  ({
                    cnic: 'CNIC',
                    student_id: 'Student ID',
                    admission_proof: 'Admission proof',
                    employment_proof: 'Employment proof',
                  })[kind],
              )
              .join(', ') || 'None'}
          </Text>
          {actorId ? (
            <MarketplaceCheckout
              actorId={actorId}
              branchId={branchId}
              quote={quote.data}
              onBusy={setCheckoutBusy}
            />
          ) : null}
          {!actorId ? (
            <Text style={{ color: colors.secondary }}>
              This is a quote. No inventory is held or booking created.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
