'use client';
import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  ClientFailure,
  ownBookingDocuments,
  selectableBookingEvidence,
  bookingEvidenceReviewState,
} from '@hsm/api-client';
import {
  createBookingInputSchema,
  type BookingQuoteSnapshot,
  type BookingDocumentSubmission,
} from '@hsm/contracts';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { inventoryScopeDenied } from './use-branch-inventory';
import { useMarketplaceCheckout } from './use-marketplace-checkout';
import { BookingEvidencePicker, bookingEvidenceLabels } from './booking-evidence-picker';
import { karachiDateTime } from '../lib/karachi-time';
import { MarketplaceButton as Button } from './ui/marketplace-button';
type Kind = BookingDocumentSubmission['kind'];
type Props = {
  actorId: string;
  branchId: string;
  quote: BookingQuoteSnapshot;
  onBusy?: ((busy: boolean) => void) | undefined;
  accessUnavailable?: boolean;
};
export function MarketplaceCheckout(props: Props) {
  return <Checkout key={JSON.stringify([props.actorId, props.branchId, props.quote])} {...props} />;
}
function Checkout({ actorId, branchId, quote, onBusy, accessUnavailable = false }: Props) {
  const prefix = useId(),
    [consent, setConsent] = useState(false),
    [cnic, setCnic] = useState(''),
    [address, setAddress] = useState('');
  const [selected, setSelected] = useState<Partial<Record<Kind, string | undefined>>>({}),
    [uploading, setUploading] = useState<Partial<Record<Kind, boolean>>>({});
  const [epochs, setEpochs] = useState<Partial<Record<Kind, number>>>({}),
    [invalid, setInvalid] = useState(false);
  const { hold, book, result } = useMarketplaceCheckout(actorId, branchId, quote);
  const documents = useInfiniteQuery({
    queryKey: ['booking-evidence', actorId, branchId],
    gcTime: 0,
    enabled: quote.policy.requiredDocuments.length > 0 && !result && !accessUnavailable,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const page = await ownBookingDocuments(browserClient(), branchId, {
        limit: 20,
        ...(pageParam ? { cursor: pageParam } : {}),
      });
      if (page.data.some((row) => row.branchId !== branchId.toLowerCase()))
        throw new ClientFailure('INVALID_RESPONSE');
      return page;
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    refetchInterval: result ? false : 5000,
  });
  const evidence = documents.data?.pages.flatMap((page) => page.data) ?? [];
  const busy = hold.isPending || book.isPending || Object.values(uploading).some(Boolean);
  useEffect(() => {
    onBusy?.(busy);
    return () => onBusy?.(false);
  }, [busy, onBusy]);
  const ready = quote.policy.requiredDocuments.every(
    (kind) =>
      selected[kind] &&
      bookingEvidenceReviewState(evidence, kind, selected[kind] ?? '') !== 'rejected',
  );
  const reviewsReady =
    !quote.policy.documentReviewRequired ||
    quote.policy.bookingMode !== 'instant' ||
    quote.policy.requiredDocuments.every((kind) =>
      selectableBookingEvidence(evidence, kind, quote.policy.allowEvidenceReuse).some(
        (row) => row.fileId === selected[kind],
      ),
    );
  const unavailable =
    accessUnavailable ||
    busy ||
    Boolean(documents.error) ||
    (quote.policy.requiredDocuments.length > 0 && (documents.isPending || documents.isFetching));
  function submit() {
    const input = createBookingInputSchema.safeParse({
      quote,
      ...(hold.data ? { holdId: hold.data.id } : {}),
      ...(address.trim() ? { permanentAddress: address.trim() } : {}),
      ...(cnic.trim() ? { cnic: cnic.trim() } : {}),
      documents: quote.policy.requiredDocuments.map((kind) => ({ kind, fileId: selected[kind] })),
    });
    setInvalid(!input.success);
    if (input.success && consent && ready && reviewsReady && !unavailable)
      book.mutate(input.data, {
        onSuccess: () => {
          setCnic('');
          setAddress('');
        },
      });
  }
  if ([documents.error, hold.error, book.error].some(inventoryScopeDenied))
    return (
      <p role="alert">Checkout access is unavailable. Sign in again or request a current quote.</p>
    );
  if (result)
    return (
      <div className="space-y-3">
        <p role="status">
          {result.state === 'confirmed' ? 'Booking confirmed' : 'Booking request sent'}
        </p>
        <p>{result.reference}</p>
        <p>Rent and deposits are paid directly to the hostel.</p>
        <Link className="text-link" href="/app/customer">
          View your bookings
        </Link>
      </div>
    );
  return (
    <section aria-label="Booking checkout" className="space-y-4">
      <h3 className="text-lg font-semibold">Complete your booking</h3>
      <p>Review the quoted terms above. Rent and deposits are paid directly to the hostel.</p>
      <label htmlFor={prefix + '-consent'} className="flex min-h-11 items-center gap-3">
        <input
          id={prefix + '-consent'}
          type="checkbox"
          checked={consent}
          disabled={busy || accessUnavailable}
          onChange={(event) => setConsent(event.target.checked)}
        />
        I agree to the booking terms and to share required documents privately with this hostel
        Owner.
      </label>
      {quote.policy.requiredDocuments.map((kind) => (
        <div key={kind} className="space-y-3">
          {selectableBookingEvidence(evidence, kind, quote.policy.allowEvidenceReuse).map((row) => (
            <Button
              key={row.id}
              variant="secondary"
              disabled={!consent || unavailable}
              onClick={() => {
                setSelected((current) => ({ ...current, [kind]: row.fileId }));
                setEpochs((current) => ({ ...current, [kind]: (current[kind] ?? 0) + 1 }));
              }}
            >
              Use accepted {bookingEvidenceLabels[kind]} from {row.createdAt}
            </Button>
          ))}
          <BookingEvidencePicker
            key={kind + ':' + (epochs[kind] ?? 0)}
            actorId={actorId}
            branchId={branchId}
            kind={kind}
            consent={consent}
            disabled={busy || accessUnavailable || Boolean(documents.error)}
            onBusy={(value) => setUploading((current) => ({ ...current, [kind]: value }))}
            onReady={(fileId) => setSelected((current) => ({ ...current, [kind]: fileId }))}
          />
          {selected[kind] ? (
            <p>
              {bookingEvidenceLabels[kind]}:{' '}
              {bookingEvidenceReviewState(evidence, kind, selected[kind] ?? '') ??
                'Awaiting verification status'}
            </p>
          ) : null}
        </div>
      ))}
      {documents.error ? (
        <>
          <p role="alert">{errorMessage(documents.error)}</p>
          <Button
            variant="secondary"
            disabled={busy || documents.isFetching}
            onClick={() => void documents.refetch()}
          >
            Retry verification status
          </Button>
        </>
      ) : null}
      {documents.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={busy || documents.isFetching}
          onClick={() => void documents.fetchNextPage()}
        >
          Load earlier verification records
        </Button>
      ) : null}
      {quote.policy.documentReviewRequired && !reviewsReady ? (
        <p>Owner verification is required before instant confirmation.</p>
      ) : null}
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label htmlFor={prefix + '-address'} className="field-label">
          Private permanent address
        </label>
        <textarea
          id={prefix + '-address'}
          className="field-input"
          maxLength={500}
          value={address}
          disabled={busy || accessUnavailable}
          onChange={(event) => setAddress(event.target.value)}
          aria-describedby={prefix + '-address-help'}
        />
        <p id={prefix + '-address-help'}>
          Required before booking. Leave blank only if already saved on your account.
        </p>
        {quote.policy.requiredDocuments.includes('cnic') ? (
          <>
            <label htmlFor={prefix + '-cnic'} className="field-label">
              Private CNIC number
            </label>
            <input
              id={prefix + '-cnic'}
              className="field-input"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={13}
              value={cnic}
              disabled={busy || accessUnavailable}
              onChange={(event) => setCnic(event.target.value)}
            />
            <p>13 digits. Leave blank only if already saved on your account.</p>
          </>
        ) : null}
        {hold.error || book.error ? (
          <p role="alert">{errorMessage(hold.error ?? book.error)}</p>
        ) : null}
        {invalid ? <p role="alert">Check the required documents and identity details.</p> : null}
        {quote.policy.holdSeconds > 0 && !hold.data ? (
          <Button
            type="button"
            variant="secondary"
            disabled={!consent || unavailable}
            onClick={() => hold.mutate()}
          >
            {hold.isPending ? 'Reserving inventory…' : 'Temporarily hold this inventory'}
          </Button>
        ) : null}
        {hold.data ? (
          <p>
            Temporary hold expiry:{' '}
            <time dateTime={hold.data.expiresAt}>{karachiDateTime(hold.data.expiresAt)}</time>.
            Expired holds cannot be used to book; request a new quote after expiry.
          </p>
        ) : null}
        <Button type="submit" disabled={!consent || !ready || !reviewsReady || unavailable}>
          {book.isPending
            ? 'Submitting booking…'
            : quote.policy.bookingMode === 'request'
              ? 'Send booking request'
              : 'Confirm booking'}
        </Button>
      </form>
    </section>
  );
}
