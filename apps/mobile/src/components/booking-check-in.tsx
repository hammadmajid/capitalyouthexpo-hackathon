import { Skeleton } from './loading/skeleton';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import type { BillingAgreementTerms } from '@hsm/contracts';
import { checkInBooking, marketplacePrice, previewBookingCheckIn } from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { Copy } from './ui';
import { MarketplaceAction as Button } from './marketplace/action';
import { CnicField, CnicOnFile, cnicComplete } from './cnic-field';
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
    queryFn: async () => previewBookingCheckIn(await actorClient(actorId), branchId, bookingId),
  });
  const submit = useMutation({
    gcTime: 0,
    mutationFn: async (terms: BillingAgreementTerms) => {
      const body = {
          policyVersionId: terms.policyVersionId,
          initialBilling: checkInBilling(terms),
          // CHG-054: typed only when the customer's account has no CNIC on file.
          ...(cnicComplete(cnic) ? { cnic } : {}),
        },
        intent = JSON.stringify(body),
        key = keys.current.get(intent) ?? randomUUID();
      keys.current.set(intent, key);
      return checkInBooking(await actorClient(actorId), branchId, bookingId, body, key);
    },
    onSuccess: () => keys.current.clear(),
    // A stale or repeated check-in (409) refreshes the list so the linked Stay replaces it.
    onSettled: () => cache.invalidateQueries({ queryKey: ['hostel-bookings', actorId, branchId] }),
  });
  if (!open) return <Button secondary label="Check in resident" onPress={() => setOpen(true)} />;
  if (submit.data)
    return (
      <View className="gap-1">
        <Copy>Resident checked in. The booking is now an active Stay.</Copy>
        <Copy>Stay reference: {submit.data.stayId}</Copy>
      </View>
    );
  const terms = preview.data?.terms;
  const needsCnic = preview.data?.cnicOnFile === false;
  return (
    <View className="gap-2" accessibilityLabel="Booking check-in">
      {preview.isPending ? <Skeleton kind="form" label="Loading agreement terms…" /> : null}
      {preview.isError ? <Copy alert>{safeMessage(preview.error)}</Copy> : null}
      {terms ? (
        <View className="gap-1">
          <Copy>Rent {marketplacePrice(terms.rentAmountPaisa)}/month</Copy>
          <Copy>Security deposit: {marketplacePrice(terms.depositPaisa)}</Copy>
          {terms.fees.map((fee) => (
            <Copy key={fee.code + ':' + fee.cadence}>
              {fee.code}: {marketplacePrice(fee.amountPaisa)} (
              {fee.cadence === 'monthly' ? 'monthly' : 'one time'})
            </Copy>
          ))}
          <Copy>
            These are the booking&apos;s captured terms; later price changes do not apply.
          </Copy>
          {needsCnic ? (
            <CnicField value={cnic} onChange={setCnic} disabled={submit.isPending} />
          ) : (
            <CnicOnFile />
          )}
          {submit.isError ? <Copy alert>{safeMessage(submit.error)}</Copy> : null}
          <Button
            label={submit.isPending ? 'Checking in…' : 'Confirm check-in'}
            disabled={submit.isPending || (needsCnic && !cnicComplete(cnic))}
            onPress={() => submit.mutate(terms)}
          />
        </View>
      ) : null}
      <Button
        secondary
        label="Cancel check-in"
        disabled={submit.isPending}
        onPress={() => setOpen(false)}
      />
    </View>
  );
}
