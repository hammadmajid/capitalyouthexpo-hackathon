import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { bookingQuoteSnapshotSchema } from '@hsm/contracts';
import { ApiFailure, listCustomerBookings, cancelCustomerBooking } from '@hsm/api-client';
import { CustomerBookings } from './customer-bookings';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  listCustomerBookings: vi.fn(),
  cancelCustomerBooking: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
const branchId = randomUUID(),
  roomId = randomUUID(),
  policyId = randomUUID(),
  id = randomUUID(),
  actorId = randomUUID();
const quoteInput = {
  target: { kind: 'room' as const, roomId },
  range: { moveInDate: '2026-10-15', moveOutDate: '2026-11-15' },
};
const quote = bookingQuoteSnapshotSchema.parse({
  version: 1,
  currency: 'PKR',
  ...quoteInput,
  listing: {
    hostelName: 'Fixture hostel',
    branchName: 'Fixture branch',
    roomTypeName: 'Two beds',
    roomLabel: '101',
    bedLabel: null,
  },
  price: { monthlyRentPaisa: 1800001, depositPaisa: 0, fees: [] },
  policyVersion: policyId,
  policyLineage: [policyId],
  quotedAt: '2026-10-14T12:00:00Z',
  policy: {
    bookingMode: 'request',
    holdSeconds: 600,
    requestExpirySeconds: 3600,
    requestReservesInventory: true,
    minimumStayDays: 1,
    maximumStayDays: 'unlimited',
    minimumAdvanceDays: 0,
    maximumAdvanceDays: 365,
    customerSelectsInventory: true,
    cancellationAllowed: true,
    cancellationCutoffHours: 0,
    allowedStayUnits: ['day', 'week', 'month'],
    requiredDocuments: [],
    allowEvidenceReuse: true,
    documentReviewRequired: false,
  },
});
const booking = {
  id,
  branchId,
  reference: 'HSM-' + id.replaceAll('-', '').toUpperCase(),
  state: 'pending_request' as const,
  quote,
  createdAt: '2026-10-14T12:00:00Z',
  requestExpiresAt: '2026-10-14T13:00:00Z',
  documents: [],
  upfront: null,
};
const caches: QueryClient[] = [];
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listCustomerBookings).mockResolvedValue({ data: [booking], nextCursor: null });
});
afterEach(() => {
  cleanup();
  caches.splice(0).forEach((cache) => cache.clear());
});
function show(actor = actorId) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  caches.push(cache);
  return {
    ...render(
      <QueryClientProvider client={cache}>
        <CustomerBookings actorId={actor} />
      </QueryClientProvider>,
    ),
    cache,
  };
}
async function open() {
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel booking' }));
  fireEvent.change(screen.getByLabelText('Cancellation reason'), {
    target: { value: ' Change of plans ' },
  });
}
it('BKG-001: displays actual agreed terms without private account IDs or payment claims', async () => {
  show();
  await screen.findByText('Status: Awaiting hostel approval');
  expect(screen.getByText(/Agreed monthly rent:/).textContent).toContain('18,000.01');
  expect(document.body.textContent).not.toContain(actorId);
  expect(document.body.textContent).not.toContain('Paid');
  expect(listCustomerBookings).toHaveBeenCalledWith({}, { limit: 20 });
});
it('BKG-001: empty history is shown only after a successful server response', async () => {
  vi.mocked(listCustomerBookings).mockResolvedValue({ data: [], nextCursor: null });
  show();
  await screen.findByText('You have no bookings yet.');
});
it('BKG-001: failed initial reads never become an empty history', async () => {
  vi.mocked(listCustomerBookings).mockRejectedValue(new Error('Offline'));
  show();
  await screen.findByRole('alert');
  expect(screen.queryByText('You have no bookings yet.')).toBeNull();
});
it('BKG-001: cursor pagination retains previous actual rows', async () => {
  vi.mocked(listCustomerBookings)
    .mockResolvedValueOnce({ data: [booking], nextCursor: id })
    .mockResolvedValueOnce({
      data: [
        {
          ...booking,
          id: randomUUID(),
          quote: { ...quote, listing: { ...quote.listing, hostelName: 'Second hostel' } },
        },
      ],
      nextCursor: null,
    });
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'More bookings' }));
  await screen.findByText('Second hostel');
  expect(screen.getByText('Fixture hostel')).toBeDefined();
  expect(listCustomerBookings).toHaveBeenLastCalledWith({}, { limit: 20, cursor: id });
});
it('BKG-009: cancellation waits for validated persisted state', async () => {
  let finish: ((result: Awaited<ReturnType<typeof cancelCustomerBooking>>) => void) | undefined;
  vi.mocked(cancelCustomerBooking).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  show();
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }));
  await waitFor(() => expect(cancelCustomerBooking).toHaveBeenCalledTimes(1));
  expect(screen.getByText('Status: Awaiting hostel approval')).toBeDefined();
  expect(screen.queryByText('Cancellation saved by the server.')).toBeNull();
  vi.mocked(listCustomerBookings).mockResolvedValue({
    data: [{ ...booking, state: 'cancelled' }],
    nextCursor: null,
  });
  finish?.({ ...booking, state: 'cancelled' });
  await screen.findByText('Cancellation saved by the server.');
  await screen.findByText('Status: Cancelled');
  expect(screen.queryByLabelText('Cancellation reason')).toBeNull();
});
it('BKG-009: interrupted cancellation preserves reason and command key for retry', async () => {
  vi.mocked(cancelCustomerBooking).mockRejectedValue(new Error('Interrupted'));
  show();
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }));
  await screen.findByRole('alert');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Confirm cancellation' }).matches(':disabled')).toBe(
      false,
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }));
  await waitFor(() => expect(cancelCustomerBooking).toHaveBeenCalledTimes(2));
  const calls = vi.mocked(cancelCustomerBooking).mock.calls;
  expect(calls[0]?.slice(0, 3)).toEqual([{}, id, 'Change of plans']);
  expect(calls[0]?.[3]).toBe(calls[1]?.[3]);
  expect(screen.getByLabelText('Cancellation reason')).toHaveProperty('value', ' Change of plans ');
});
it.each([{ ...booking, id: randomUUID(), state: 'cancelled' as const }, booking])(
  'SEC-003: mismatched cancellation responses never show success',
  async (result) => {
    vi.mocked(cancelCustomerBooking).mockResolvedValue(result);
    show();
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }));
    await screen.findByRole('alert');
    expect(screen.queryByText('Cancellation saved by the server.')).toBeNull();
  },
);
it('SEC-003: account change discards the previous private cancellation form', async () => {
  const mounted = show();
  await open();
  vi.mocked(listCustomerBookings).mockResolvedValue({ data: [], nextCursor: null });
  mounted.rerender(
    <QueryClientProvider client={mounted.cache}>
      <CustomerBookings actorId={randomUUID()} />
    </QueryClientProvider>,
  );
  await screen.findByText('You have no bookings yet.');
  expect(screen.queryByLabelText('Cancellation reason')).toBeNull();
});
it('SEC-003: revoked access hides cached bookings and cancellation forms', async () => {
  vi.mocked(cancelCustomerBooking).mockRejectedValue(
    new ApiFailure({
      type: 'https://example.test/problem',
      title: 'Denied',
      status: 403,
      code: 'FORBIDDEN',
      detail: 'Unavailable',
      traceId: 'fixture',
    }),
  );
  show();
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }));
  await screen.findByRole('button', { name: 'Retry booking access' });
  expect(screen.queryByText('Fixture hostel')).toBeNull();
  expect(screen.queryByLabelText('Cancellation reason')).toBeNull();
});

it('BKG-009: whitespace reasons fail before sending a cancellation', async () => {
  show();
  await open();
  fireEvent.change(screen.getByLabelText('Cancellation reason'), { target: { value: '   ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }));
  await screen.findByText('Enter a cancellation reason.');
  expect(cancelCustomerBooking).not.toHaveBeenCalled();
});
it('SEC-003: a refresh outage preserves the reason while disabling cancellation', async () => {
  const mounted = show();
  await open();
  vi.mocked(listCustomerBookings).mockRejectedValue(new Error('Offline'));
  await mounted.cache.invalidateQueries({ queryKey: ['customer-bookings', actorId], exact: true });
  await screen.findByText(/Bookings could not refresh/);
  expect(screen.getByText('Fixture hostel')).toBeDefined();
  expect(screen.getByLabelText('Cancellation reason')).toHaveProperty('value', ' Change of plans ');
  expect(screen.getByRole('button', { name: 'Confirm cancellation' }).matches(':disabled')).toBe(
    true,
  );
});
it('BKG-009: a removed booking never retargets cancellation to another booking', async () => {
  const mounted = show();
  await open();
  vi.mocked(listCustomerBookings).mockResolvedValue({
    data: [
      {
        ...booking,
        id: randomUUID(),
        quote: { ...quote, listing: { ...quote.listing, hostelName: 'Other hostel' } },
      },
    ],
    nextCursor: null,
  });
  await mounted.cache.invalidateQueries({ queryKey: ['customer-bookings', actorId], exact: true });
  await screen.findByText('This booking is no longer available for cancellation.');
  expect(screen.queryByRole('button', { name: 'Confirm cancellation' })).toBeNull();
  expect(cancelCustomerBooking).not.toHaveBeenCalled();
});
