import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  pendingBookingDocuments,
  reviewBookingDocument,
  downloadBookingDocument,
} from '@hsm/api-client';
import { OwnerDocumentReview } from './owner-document-review';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  pendingBookingDocuments: vi.fn(),
  reviewBookingDocument: vi.fn(),
  downloadBookingDocument: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
const actorId = randomUUID(),
  branchId = randomUUID(),
  id = randomUUID();
const row = {
  id,
  branchId,
  bookingId: null,
  kind: 'student_id' as const,
  state: 'pending' as const,
  createdAt: '2026-10-15T10:00:00Z',
  reviewedAt: null,
  rejectionCode: null,
};
const caches: QueryClient[] = [];
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(pendingBookingDocuments).mockResolvedValue({ data: [row], nextCursor: null });
});
afterEach(() => {
  cleanup();
  for (const cache of caches.splice(0)) cache.clear();
});
function show() {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  caches.push(cache);
  return {
    ...render(
      <QueryClientProvider client={cache}>
        <OwnerDocumentReview actorId={actorId} branchId={branchId} />
      </QueryClientProvider>,
    ),
    cache,
  };
}
it('CHG-008: Owner queue renders actual metadata and only fetches selected branch', async () => {
  show();
  expect(await screen.findByText('student id')).toBeDefined();
  expect(pendingBookingDocuments).toHaveBeenCalledWith({}, branchId, { limit: 20 });
  expect(screen.queryByText('No documents are awaiting your review.')).toBeNull();
  expect(document.body.textContent).not.toContain(actorId);
});
it('CHG-008: empty and failed queues remain truthful and retryable', async () => {
  vi.mocked(pendingBookingDocuments).mockRejectedValueOnce(new Error('Unavailable'));
  vi.mocked(pendingBookingDocuments).mockResolvedValue({ data: [], nextCursor: null });
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Retry documents' }));
  expect(await screen.findByText('No documents are awaiting your review.')).toBeDefined();
});
it('BKG-001: review sends Owner decision and refetches after successful commit', async () => {
  vi.mocked(reviewBookingDocument).mockResolvedValue({
    ...row,
    state: 'accepted',
    reviewedAt: row.createdAt,
  });
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Accept document' }));
  await waitFor(() =>
    expect(reviewBookingDocument).toHaveBeenCalledWith(
      {},
      branchId,
      id,
      { state: 'accepted' },
      expect.stringMatching(/^[a-f0-9-]{36}$/),
    ),
  );
  await waitFor(() => expect(pendingBookingDocuments).toHaveBeenCalledTimes(2));
});
it('BKG-001: failed decision retries retain command idempotency key', async () => {
  vi.mocked(reviewBookingDocument).mockRejectedValue(new Error('Connection interrupted'));
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Reject document' }));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Reject document' }));
  await waitFor(() => expect(reviewBookingDocument).toHaveBeenCalledTimes(2));
  expect(vi.mocked(reviewBookingDocument).mock.calls[0]?.[4]).toBe(
    vi.mocked(reviewBookingDocument).mock.calls[1]?.[4],
  );
});
it('SEC-003: private document link is requested only on action and opens without referrer/opener', async () => {
  vi.mocked(downloadBookingDocument).mockResolvedValue({
    url: 'https://storage.example.test/private',
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  });
  show();
  expect(await screen.findByText('student id')).toBeDefined();
  expect(downloadBookingDocument).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Prepare private download' }));
  const link = await screen.findByRole('link', { name: 'Open private document (temporary link)' });
  expect(link.getAttribute('href')).toBe('https://storage.example.test/private');
  expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  expect(link.getAttribute('referrerpolicy')).toBe('no-referrer');
});

it('CHG-008 / BKG-001: Owner review refreshes only the same account and branch booking status', async () => {
  vi.mocked(reviewBookingDocument).mockResolvedValue({
    ...row,
    state: 'accepted',
    reviewedAt: '2026-10-15T11:00:00Z',
  });
  const mounted = show();
  const own = ['hostel-bookings', actorId, branchId];
  const otherActor = ['hostel-bookings', randomUUID(), branchId];
  const otherBranch = ['hostel-bookings', actorId, randomUUID()];
  for (const key of [own, otherActor, otherBranch]) mounted.cache.setQueryData(key, { data: [] });
  fireEvent.click(await screen.findByRole('button', { name: 'Accept document' }));
  await waitFor(() => expect(pendingBookingDocuments).toHaveBeenCalledTimes(2));
  expect(mounted.cache.getQueryState(own)?.isInvalidated).toBe(true);
  expect(mounted.cache.getQueryState(otherActor)?.isInvalidated).toBe(false);
  expect(mounted.cache.getQueryState(otherBranch)?.isInvalidated).toBe(false);
});
