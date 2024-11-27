import { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ownBookingDocuments } from '@hsm/api-client';
import {
  createBookingInputSchema,
  type BookingQuoteSnapshot,
  type BookingDocumentSubmission,
} from '@hsm/contracts';
import { mobileMarketplaceColors as colors, marketplaceMetrics as metrics } from '@hsm/ui';
import { actorClient } from '../../lib/runtime';
import { selectableBookingEvidence, bookingEvidenceReviewState } from '../../lib/booking-evidence';
import { safeMessage } from '../../lib/messages';
import { Copy } from '../ui';
import { MarketplaceAction as Button } from './action';
import { BookingEvidencePicker, evidenceLabels } from './booking-evidence';
import { karachiDateTime } from '../../lib/karachi-time';
import { useCheckout } from './use-checkout';
type Kind = BookingDocumentSubmission['kind'];
export function MarketplaceCheckout(props: {
  actorId: string;
  branchId: string;
  quote: BookingQuoteSnapshot;
  onBusy?: (busy: boolean) => void;
}) {
  return <Checkout key={JSON.stringify([props.actorId, props.branchId, props.quote])} {...props} />;
}
function Checkout({
  actorId,
  branchId,
  quote,
  onBusy,
}: {
  actorId: string;
  branchId: string;
  quote: BookingQuoteSnapshot;
  onBusy?: (busy: boolean) => void;
}) {
  const [consent, setConsent] = useState(false),
    [cnic, setCnic] = useState(''),
    [permanentAddress, setPermanentAddress] = useState('');
  const [selected, setSelected] = useState<Partial<Record<Kind, string | undefined>>>({});
  const [uploading, setUploading] = useState<Partial<Record<Kind, boolean>>>({});
  const [invalid, setInvalid] = useState(false);
  const [pickerEpoch, setPickerEpoch] = useState<Partial<Record<Kind, number>>>({});
  const { hold, book, result } = useCheckout(actorId, branchId, quote);
  // BKG-005: an expired hold is never sent; the customer can hold again without losing documents.
  const [now, setNow] = useState(() => Date.now());
  const holdEnds = hold.data ? Date.parse(hold.data.expiresAt) : undefined;
  useEffect(() => {
    if (holdEnds === undefined || holdEnds <= now) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(holdEnds - now + 50, 2 ** 31 - 1));
    return () => clearTimeout(timer);
  }, [holdEnds, now]);
  const liveHold = hold.data && holdEnds !== undefined && holdEnds > now ? hold.data : undefined;
  const documents = useInfiniteQuery({
    queryKey: ['booking-evidence', actorId, branchId],
    gcTime: 0,
    enabled: quote.policy.requiredDocuments.length > 0,
    initialPageParam: null,
    queryFn: async ({ pageParam }: { pageParam: string | null }) =>
      ownBookingDocuments(await actorClient(actorId), branchId, {
        limit: 20,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor,
    refetchInterval: result ? false : 5000,
  });
  const evidence = documents.data?.pages.flatMap((page) => page.data) ?? [];
  const busy = hold.isPending || book.isPending || Object.values(uploading).some(Boolean);
  const ready = quote.policy.requiredDocuments.every((kind) => selected[kind]);
  useEffect(() => {
    onBusy?.(busy);
    return () => onBusy?.(false);
  }, [busy, onBusy]);
  const reviewsReady =
    !quote.policy.documentReviewRequired ||
    quote.policy.bookingMode !== 'instant' ||
    quote.policy.requiredDocuments.every((kind) =>
      selectableBookingEvidence(evidence, kind, quote.policy.allowEvidenceReuse).some(
        (row) => row.fileId === selected[kind],
      ),
    );
  function submit() {
    const input = createBookingInputSchema.safeParse({
      quote,
      ...(liveHold ? { holdId: liveHold.id } : {}),
      ...(permanentAddress.trim() ? { permanentAddress: permanentAddress.trim() } : {}),
      ...(cnic.trim() ? { cnic: cnic.trim() } : {}),
      documents: quote.policy.requiredDocuments.map((kind) => ({ kind, fileId: selected[kind] })),
    });
    setInvalid(!input.success);
    if (input.success && consent && ready && reviewsReady && !busy) {
      book.mutate(input.data, {
        onSuccess: () => {
          setCnic('');
          setPermanentAddress('');
          book.reset();
        },
      });
    }
  }
  if (result)
    return (
      <View className="gap-3">
        <Copy>{result.state === 'confirmed' ? 'Booking confirmed' : 'Booking request sent'}</Copy>
        <Copy>{result.reference}</Copy>
        <Copy>View this booking in the Bookings tab.</Copy>
      </View>
    );
  return (
    <View className="gap-4">
      <Copy>Pay rent and deposits directly to the hostel.</Copy>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel="Agree to booking terms and private Owner document verification"
        accessibilityState={{ checked: consent, disabled: busy }}
        disabled={busy}
        onPress={() => setConsent((value) => !value)}
        style={{ minHeight: metrics.touch, padding: metrics.md }}
      >
        <Copy>
          {consent ? '[x]' : '[ ]'} I agree to these booking terms and to share the required
          documents privately with this hostel Owner.
        </Copy>
      </Pressable>
      {quote.policy.requiredDocuments.map((kind) => (
        <View key={kind} className="gap-2">
          {selectableBookingEvidence(evidence, kind, quote.policy.allowEvidenceReuse).map((row) => (
            <Button
              key={row.id}
              secondary
              label={
                'Use accepted ' + evidenceLabels[kind] + ' from ' + karachiDateTime(row.createdAt)
              }
              disabled={!consent || busy}
              onPress={() => {
                setSelected((current) => ({ ...current, [kind]: row.fileId }));
                setPickerEpoch((current) => ({ ...current, [kind]: (current[kind] ?? 0) + 1 }));
              }}
            />
          ))}
          <BookingEvidencePicker
            key={kind + ':' + (pickerEpoch[kind] ?? 0)}
            actorId={actorId}
            branchId={branchId}
            kind={kind}
            consent={consent}
            disabled={busy}
            onBusy={(value) => setUploading((current) => ({ ...current, [kind]: value }))}
            onReady={(fileId) => setSelected((current) => ({ ...current, [kind]: fileId }))}
          />
          {selected[kind] ? (
            <Copy>
              {evidenceLabels[kind]}:{' '}
              {bookingEvidenceReviewState(evidence, kind, selected[kind] ?? '') ??
                'Awaiting verification status'}
            </Copy>
          ) : null}
        </View>
      ))}
      <Copy>
        Permanent address is required before booking. Leave blank only if already saved on your
        account.
      </Copy>
      <TextInput
        accessibilityLabel="Private permanent address"
        value={permanentAddress}
        onChangeText={setPermanentAddress}
        maxLength={500}
        multiline
        editable={!busy}
        placeholder="House, street, area and city"
        placeholderTextColor={colors.secondary}
        style={{
          minHeight: metrics.touch,
          padding: metrics.md,
          borderWidth: 1,
          borderColor: colors.border,
          color: colors.heading,
        }}
      />
      {quote.policy.requiredDocuments.includes('cnic') ? (
        <TextInput
          accessibilityLabel="Private CNIC number"
          secureTextEntry
          keyboardType="number-pad"
          value={cnic}
          onChangeText={setCnic}
          maxLength={13}
          editable={!busy}
          placeholder="13 digits; leave blank if already on your account"
          placeholderTextColor={colors.secondary}
          style={{
            minHeight: metrics.touch,
            padding: metrics.md,
            borderWidth: 1,
            borderColor: colors.border,
            color: colors.heading,
          }}
        />
      ) : null}
      {documents.hasNextPage ? (
        <Button
          secondary
          label="Load earlier verification records"
          disabled={busy || documents.isFetchingNextPage}
          onPress={() => {
            void documents.fetchNextPage();
          }}
        />
      ) : null}
      {quote.policy.documentReviewRequired && !reviewsReady ? (
        <Copy>Owner verification is required before instant confirmation.</Copy>
      ) : null}
      {hold.data && !liveHold ? <Copy alert>Hold expired · hold again</Copy> : null}
      {quote.policy.holdSeconds > 0 && !liveHold ? (
        <Button
          secondary
          label={hold.isPending ? 'Reserving inventory...' : 'Temporarily hold this inventory'}
          disabled={!consent || busy}
          onPress={() => hold.mutate()}
        />
      ) : null}
      {liveHold ? <Copy>Held until {karachiDateTime(liveHold.expiresAt)}</Copy> : null}
      {hold.isError || book.isError || documents.isError ? (
        <Copy alert>{safeMessage(hold.error ?? book.error ?? documents.error)}</Copy>
      ) : null}
      {invalid ? <Copy alert>Check the required documents and identity details.</Copy> : null}
      <Button
        label={
          book.isPending
            ? 'Submitting booking...'
            : quote.policy.bookingMode === 'request'
              ? 'Send booking request'
              : 'Confirm booking'
        }
        disabled={!consent || !ready || !reviewsReady || busy}
        onPress={submit}
      />
    </View>
  );
}
