import { Skeleton } from './loading/skeleton';
import { useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import type { BookingUpfront } from '@hsm/contracts';
import {
  customerPaymentInstructions,
  marketplacePrice,
  submitBookingPaymentProof,
} from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { PrivateFilePicker } from './private-file-picker';
import { Copy } from './ui';
import { DateField } from './date-field';
import { MarketplaceAction as Button } from './marketplace/action';
export const upfrontLabels: Record<BookingUpfront['status'], string> = {
  awaiting_approval: 'Awaiting hostel approval before payment',
  awaiting_payment: 'Approved: pay the hostel directly, then submit your proof',
  verification_pending: 'Payment proof submitted: awaiting hostel verification',
  verified: 'Upfront payment verified by the hostel',
};
const methods = ['bank_transfer', 'jazzcash', 'easypaisa', 'cash', 'other'] as const;
function Instructions({ actorId, bookingId }: { actorId: string; bookingId: string }) {
  const query = useQuery({
    queryKey: ['booking-payment-instructions', actorId, bookingId],
    gcTime: 0,
    queryFn: async () => customerPaymentInstructions(await actorClient(actorId), bookingId),
  });
  if (query.isPending)
    return <Skeleton kind="details" label="Loading hostel payment instructions…" />;
  if (query.isError)
    return (
      <View className="gap-2">
        <Copy alert>{safeMessage(query.error)}</Copy>
      </View>
    );
  if (!query.data.data.length)
    return (
      <Copy>The hostel has not published payment instructions. Message the hostel to ask.</Copy>
    );
  return (
    <View className="gap-1" accessibilityLabel="Hostel payment instructions">
      {query.data.data.map((row) => (
        <Copy key={row.id}>
          {row.method.replaceAll('_', ' ')}: {row.accountTitle} · {row.accountIdentifier}
          {row.instructions ? ' · ' + row.instructions : ''}
        </Copy>
      ))}
    </View>
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
    [busy, setBusy] = useState(false),
    [method, setMethod] = useState<(typeof methods)[number]>('bank_transfer'),
    [paidOn, setPaidOn] = useState(''),
    [reference, setReference] = useState('');
  const submit = useMutation({
    gcTime: 0,
    mutationFn: async (input: Record<string, unknown>) => {
      const command = JSON.stringify(input),
        key = keys.current.get(command) ?? randomUUID();
      keys.current.set(command, key);
      return submitBookingPaymentProof(await actorClient(actorId), bookingId, input, key);
    },
    onSuccess: async (_result, input) => {
      keys.current.delete(JSON.stringify(input));
      await cache.invalidateQueries({ queryKey: ['customer-bookings', actorId], exact: true });
    },
  });
  const proof = upfront.proof,
    validDate = /^\d{4}-\d{2}-\d{2}$/.test(paidOn);
  return (
    <View className="gap-3 rounded-input bg-icy p-3" accessibilityLabel="Upfront payment">
      <Copy>
        Upfront{' '}
        {upfront.requirement === 'none'
          ? 'selected transport'
          : upfront.requirement.replaceAll('_', ' ')}
        : {marketplacePrice(upfront.amountPaisa)}
      </Copy>
      <Copy>{upfrontLabels[upfront.status]}</Copy>
      {proof?.state === 'rejected' ? (
        <Copy alert>Previous proof not accepted: {proof.reviewReason}</Copy>
      ) : null}
      {open && upfront.status === 'awaiting_payment' ? (
        <View className="gap-2">
          <Instructions actorId={actorId} bookingId={bookingId} />
          <PrivateFilePicker
            actorId={actorId}
            label="Payment proof (screenshot or receipt)"
            purpose="payment_proof"
            disabled={submit.isPending}
            onReady={setFileId}
            onBusy={setBusy}
          />
          <View className="flex-row flex-wrap gap-2">
            {methods.map((value) => (
              <Button
                key={value}
                secondary={method !== value}
                label={value.replaceAll('_', ' ')}
                onPress={() => setMethod(value)}
              />
            ))}
          </View>
          <DateField
            label="Payment date"
            value={paidOn}
            onChange={setPaidOn}
            disabled={submit.isPending}
          />
          <TextInput
            placeholder="Transaction reference (optional)"
            accessibilityLabel="Transaction reference (optional)"
            className="rounded-input border border-border px-3 py-2"
            maxLength={120}
            value={reference}
            editable={!submit.isPending}
            onChangeText={setReference}
          />
          {submit.isError ? <Copy alert>{safeMessage(submit.error)}</Copy> : null}
          <Button
            label={submit.isPending ? 'Submitting proof…' : 'Submit payment proof'}
            disabled={!fileId || !validDate || busy || submit.isPending}
            onPress={() => {
              if (!fileId || !validDate) return;
              submit.mutate({
                fileId,
                amountPaisa: upfront.amountPaisa,
                method,
                paidOn,
                reference: reference.trim() || null,
              });
            }}
          />
          <Copy>The hostel must verify your payment proof.</Copy>
        </View>
      ) : null}
    </View>
  );
}
