'use client';
import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import {
  pendingBookingDocuments,
  reviewBookingDocument,
  downloadBookingDocument,
} from '@hsm/api-client';
import type { BookingDocumentReview } from '@hsm/contracts';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { karachiDateTime } from '../lib/karachi-time';
import { Button } from './ui/button';
type Rejection = Extract<BookingDocumentReview, { state: 'rejected' }>['rejectionCode'];
const reasons: { value: Rejection; label: string }[] = [
  { value: 'unreadable', label: 'Unreadable document' },
  { value: 'wrong_document', label: 'Wrong document type' },
  { value: 'details_mismatch', label: 'Details do not match' },
  { value: 'other', label: 'Other verification issue' },
];
export function OwnerDocumentReview({ actorId, branchId }: { actorId: string; branchId: string }) {
  const cache = useQueryClient(),
    queryKey = ['owner-document-review', actorId, branchId];
  const queue = useInfiniteQuery({
    queryKey,
    gcTime: 0,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      pendingBookingDocuments(browserClient(), branchId, {
        limit: 20,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const [busy, setBusy] = useState<string>(),
    [error, setError] = useState<string>();
  const [reason, setReason] = useState<Rejection>('unreadable');
  const [download, setDownload] = useState<{ id: string; url: string; expiresAt: string }>();
  const keys = useRef(new Map<string, string>());
  useEffect(() => {
    if (!download) return;
    const timer = window.setTimeout(
      () => setDownload(undefined),
      Math.max(0, Date.parse(download.expiresAt) - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [download]);
  async function review(documentId: string, input: BookingDocumentReview) {
    setBusy(documentId);
    setError(undefined);
    setDownload(undefined);
    const command = JSON.stringify({ documentId, input });
    const key = keys.current.get(command) ?? crypto.randomUUID();
    keys.current.set(command, key);
    try {
      await reviewBookingDocument(browserClient(), branchId, documentId, input, key);
      keys.current.delete(command);
      await Promise.all([
        cache.invalidateQueries({ queryKey, exact: true }),
        cache.invalidateQueries({ queryKey: ['hostel-bookings', actorId, branchId], exact: true }),
      ]);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(undefined);
    }
  }
  async function prepareDownload(documentId: string) {
    setBusy(documentId);
    setError(undefined);
    setDownload(undefined);
    try {
      const result = await downloadBookingDocument(browserClient(), branchId, documentId);
      if (Date.parse(result.expiresAt) <= Date.now())
        throw new Error('Download expired. Request a new link.');
      setDownload({ id: documentId, ...result });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(undefined);
    }
  }
  const rows = queue.data?.pages.flatMap((page) => page.data);
  return (
    <section className="mt-6 space-y-4" aria-label="Owner document review">
      <h3 className="text-lg font-semibold text-hsm-heading">Booking document review</h3>
      <p className="text-sm">
        Private documents shared with you for this branch. Use them only to verify the booking.
      </p>
      {queue.isPending && <p role="status">Loading documents…</p>}
      {queue.error && (
        <>
          <p role="alert">{errorMessage(queue.error)}</p>
          <Button variant="secondary" onClick={() => void queue.refetch()}>
            Retry documents
          </Button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {rows?.length === 0 && <p>No documents are awaiting your review.</p>}
      {rows?.map((document) => (
        <article
          key={document.id}
          className="space-y-3 rounded-panel border border-hsm-border bg-hsm-surface p-4"
        >
          <h4 className="font-semibold">{document.kind.replaceAll('_', ' ')}</h4>
          <p className="text-sm">
            Submitted{' '}
            <time dateTime={document.createdAt}>{karachiDateTime(document.createdAt)}</time>
          </p>
          <p className="text-sm">Awaiting Owner verification</p>
          <Button
            variant="secondary"
            disabled={Boolean(busy)}
            onClick={() => void prepareDownload(document.id)}
          >
            Prepare private download
          </Button>
          {download?.id === document.id && (
            <a
              className="block text-hsm-primary underline"
              href={download.url}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
            >
              Open private document (temporary link)
            </a>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={Boolean(busy)}
              onClick={() => void review(document.id, { state: 'accepted' })}
            >
              Accept document
            </Button>
            <label className="field-label">
              Rejection reason
              <select
                className="field-input"
                value={reason}
                disabled={Boolean(busy)}
                onChange={(event) => {
                  const selected = reasons.find((item) => item.value === event.target.value);
                  if (selected) setReason(selected.value);
                }}
              >
                {reasons.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant="secondary"
              disabled={Boolean(busy)}
              onClick={() => void review(document.id, { state: 'rejected', rejectionCode: reason })}
            >
              Reject document
            </Button>
          </div>
          {busy === document.id && <p role="status">Processing document…</p>}
        </article>
      ))}
      {queue.hasNextPage && (
        <Button
          variant="secondary"
          disabled={queue.isFetchingNextPage || Boolean(busy)}
          onClick={() => void queue.fetchNextPage()}
        >
          Load more documents
        </Button>
      )}
    </section>
  );
}
