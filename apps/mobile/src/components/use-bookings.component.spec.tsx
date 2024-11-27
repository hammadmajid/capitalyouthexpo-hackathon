/// <reference types="jest" />
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { listCustomerBookings, cancelCustomerBooking } from '@hsm/api-client';
import { bookingQuoteSnapshotSchema } from '@hsm/contracts';
import { actorClient, client } from '../lib/runtime';
import { useBookings } from './use-bookings';
jest.mock('../lib/runtime', () => ({ client: {}, actorClient: jest.fn() }));
jest.mock('expo-crypto', () => {
  let sequence = 0;
  return { randomUUID: () => '019a1234-1234-7123-8123-' + String(++sequence).padStart(12, '0') };
});
jest.mock('@hsm/api-client', () => ({
  listCustomerBookings: jest.fn(),
  cancelCustomerBooking: jest.fn(),
}));
const actorA = '019a1234-1234-7123-8123-123456789abc',
  actorB = '019a1234-1234-7123-8123-123456789abd';
const branchId = actorA,
  roomId = actorB,
  policyId = actorA;
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
type Page = Awaited<ReturnType<typeof listCustomerBookings>>;
let cache: QueryClient;
beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(actorClient).mockResolvedValue(client);
  cache = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
});
afterEach(() => cache.clear());
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={cache}>{children}</QueryClientProvider>;
}
function page(hostelName: string, id: string): Page {
  return {
    data: [
      {
        id,
        branchId,
        reference: 'HSM-' + id.replaceAll('-', '').toUpperCase(),
        state: 'confirmed',
        quote: { ...quote, listing: { ...quote.listing, hostelName } },
        createdAt: '2026-10-15T10:00:00Z',
        requestExpiresAt: null,
        documents: [],
        upfront: null,
      },
    ],
    nextCursor: null,
  };
}
test('SEC-003 / BKG-001: late previous-account booking data cannot populate the current history', async () => {
  let finishFirst: (value: Page) => void = () => {
    throw new Error('First request not started');
  };
  const first = new Promise<Page>((resolve) => {
    finishFirst = resolve;
  });
  jest
    .mocked(listCustomerBookings)
    .mockImplementationOnce(() => first)
    .mockResolvedValueOnce(page('Current account hostel', actorB));
  const hook = await renderHook(({ actorId }: { actorId: string }) => useBookings(actorId), {
    initialProps: { actorId: actorA },
    wrapper,
  });
  await waitFor(() => expect(listCustomerBookings).toHaveBeenCalledTimes(1));
  await hook.rerender({ actorId: actorB });
  await waitFor(() =>
    expect(hook.result.current.query.data?.pages[0]?.data[0]?.quote.listing.hostelName).toBe(
      'Current account hostel',
    ),
  );
  await act(async () => {
    finishFirst(page('Previous account private hostel', actorA));
    await first;
  });
  expect(hook.result.current.query.data?.pages[0]?.data[0]?.quote.listing.hostelName).toBe(
    'Current account hostel',
  );
});
test('BKG-009: failed cancellation retries retain idempotency key and invalidate only own history', async () => {
  const stored = page('Own hostel', actorA).data[0];
  if (!stored) throw new Error('Booking fixture missing');
  jest
    .mocked(listCustomerBookings)
    .mockResolvedValueOnce(page('Own hostel', actorA))
    .mockResolvedValue({ data: [{ ...stored, state: 'cancelled' }], nextCursor: null });
  jest
    .mocked(cancelCustomerBooking)
    .mockRejectedValueOnce(new Error('Interrupted'))
    .mockResolvedValueOnce({ ...stored, state: 'cancelled' });
  const hook = await renderHook(() => useBookings(actorA), { wrapper });
  await waitFor(() => expect(hook.result.current.query.isSuccess).toBe(true));
  const input = { id: actorA, reason: 'Change of plans' };
  await act(async () => {
    await expect(hook.result.current.cancel.mutateAsync(input)).rejects.toThrow('Interrupted');
  });
  await act(async () => {
    await hook.result.current.cancel.mutateAsync(input);
  });
  expect(cancelCustomerBooking).toHaveBeenCalledTimes(2);
  expect(jest.mocked(cancelCustomerBooking).mock.calls[0]?.[3]).toBe(
    jest.mocked(cancelCustomerBooking).mock.calls[1]?.[3],
  );
  await waitFor(() => expect(listCustomerBookings).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(hook.result.current.query.data?.pages[0]?.data[0]?.state).toBe('cancelled'),
  );
});

test('SEC-003: history never fetches under a replacement account token', async () => {
  jest.mocked(actorClient).mockRejectedValue(new Error('Account changed'));
  jest.mocked(listCustomerBookings).mockResolvedValue({ data: [], nextCursor: null });
  const hook = await renderHook(() => useBookings(actorA), { wrapper });
  await waitFor(() => expect(hook.result.current.query.isError).toBe(true));
  expect(listCustomerBookings).not.toHaveBeenCalled();
});

test('SEC-003: completed private cancellation variables leave the cache when the screen unmounts', async () => {
  const stored = page('Own hostel', actorA).data[0];
  if (!stored) throw new Error('Booking fixture missing');
  jest.mocked(listCustomerBookings).mockResolvedValue({ data: [], nextCursor: null });
  jest.mocked(cancelCustomerBooking).mockResolvedValue({ ...stored, state: 'cancelled' });
  const hook = await renderHook(() => useBookings(actorA), { wrapper });
  await act(async () => {
    await hook.result.current.cancel.mutateAsync({
      id: actorA,
      reason: 'Private cancellation reason',
    });
  });
  expect(cache.getMutationCache().getAll()).toHaveLength(1);
  await hook.unmount();
  await waitFor(() => expect(cache.getMutationCache().getAll()).toHaveLength(0));
});
