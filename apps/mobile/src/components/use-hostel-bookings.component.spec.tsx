/// <reference types="jest" />
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { listHostelBookings, transitionHostelBooking, readInventoryAccess } from '@hsm/api-client';
import { bookingQuoteSnapshotSchema } from '@hsm/contracts';
import { actorClient, client } from '../lib/runtime';
import { useHostelBookings } from './use-hostel-bookings';
jest.mock('../lib/runtime', () => ({ client: {}, actorClient: jest.fn() }));
jest.mock('expo-crypto', () => {
  let sequence = 0;
  return { randomUUID: () => '019a1234-1234-7123-8123-' + String(++sequence).padStart(12, '0') };
});
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual<typeof import('@hsm/api-client')>('@hsm/api-client'),
  listHostelBookings: jest.fn(),
  transitionHostelBooking: jest.fn(),
  readInventoryAccess: jest.fn(),
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
type Page = Awaited<ReturnType<typeof listHostelBookings>>;
const booking = {
  id: actorB,
  branchId,
  reference: 'HSM-' + actorB.replaceAll('-', '').toUpperCase(),
  state: 'pending_request' as const,
  quote,
  createdAt: '2026-10-15T10:00:00Z',
  requestExpiresAt: '2026-10-15T11:00:00Z',
  documents: [],
  upfront: null,
};
let cache: QueryClient;
beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(actorClient).mockResolvedValue(client);
  jest.mocked(readInventoryAccess).mockResolvedValue({
    branchId,
    permissions: ['booking_manage'],
    canConfigureManagers: false,
  });
  jest.mocked(listHostelBookings).mockResolvedValue({ data: [booking], nextCursor: null });
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(() => cache.clear());
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={cache}>{children}</QueryClientProvider>;
}
async function show() {
  const saved = jest.fn();
  return {
    ...(await renderHook(() => useHostelBookings(actorA, branchId, saved), { wrapper })),
    saved,
  };
}
test('ACC-004 / SEC-003: both permission and branch-history reads use the verified frozen actor client', async () => {
  const { result } = await show();
  await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
  await waitFor(() => expect(result.current.access.isSuccess).toBe(true));
  expect(actorClient).toHaveBeenCalledWith(actorA);
  expect(jest.mocked(actorClient).mock.calls.every((call) => call[0] === actorA)).toBe(true);
  expect(readInventoryAccess).toHaveBeenCalledWith(client, branchId);
  expect(listHostelBookings).toHaveBeenCalledWith(client, branchId, { limit: 20 });
});
test('BKG-001: actual branch cursor retains previous rows', async () => {
  const second = { ...booking, id: actorA };
  jest
    .mocked(listHostelBookings)
    .mockResolvedValueOnce({ data: [booking], nextCursor: actorB })
    .mockResolvedValueOnce({ data: [second], nextCursor: null });
  const { result } = await show();
  await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
  await waitFor(() => expect(result.current.query.data?.pages[0]?.nextCursor).toBe(actorB));
  await act(async () => {
    await result.current.query.fetchNextPage();
  });
  await waitFor(() => expect(result.current.query.data?.pages).toHaveLength(2));
  expect(
    result.current.query.data?.pages.flatMap((page) => page.data).map((row) => row.id),
  ).toEqual([actorB, actorA]);
  expect(listHostelBookings).toHaveBeenLastCalledWith(client, branchId, {
    limit: 20,
    cursor: actorB,
  });
});
test('BKG-009: failed native commands retain their normalized reason and key', async () => {
  jest.mocked(transitionHostelBooking).mockRejectedValue(new Error('Interrupted'));
  const { result } = await show();
  await waitFor(() => expect(result.current.access.isSuccess).toBe(true));
  const input = { id: actorB, action: 'reject' as const, reason: ' No suitable availability ' };
  await act(async () => {
    await expect(result.current.action.mutateAsync(input)).rejects.toThrow('Interrupted');
  });
  await act(async () => {
    await expect(result.current.action.mutateAsync(input)).rejects.toThrow('Interrupted');
  });
  const calls = jest.mocked(transitionHostelBooking).mock.calls;
  expect(calls).toHaveLength(2);
  expect(calls[0]?.slice(0, 5)).toEqual([
    client,
    branchId,
    actorB,
    'reject',
    'No suitable availability',
  ]);
  expect(calls[0]?.[5]).toBe(calls[1]?.[5]);
});
test('BKG-001: successful native confirmation waits for the persisted response and refreshes actual records', async () => {
  let finish: ((result: Awaited<ReturnType<typeof transitionHostelBooking>>) => void) | undefined;
  jest.mocked(transitionHostelBooking).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { result, saved } = await show();
  await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
  await act(async () => {
    result.current.action.mutate({ id: actorB, action: 'confirm', reason: 'Reviewed' });
  });
  await waitFor(() => expect(transitionHostelBooking).toHaveBeenCalledTimes(1));
  expect(saved).not.toHaveBeenCalled();
  expect(result.current.query.data?.pages[0]?.data[0]?.state).toBe('pending_request');
  jest
    .mocked(listHostelBookings)
    .mockResolvedValue({ data: [{ ...booking, state: 'confirmed' }], nextCursor: null });
  await act(async () => {
    finish?.({ ...booking, state: 'confirmed' });
  });
  await waitFor(() => expect(result.current.action.isSuccess).toBe(true));
  expect(saved).toHaveBeenCalledTimes(1);
  expect(result.current.query.data?.pages[0]?.data[0]?.state).toBe('confirmed');
  expect(jest.mocked(actorClient).mock.calls.every((call) => call[0] === actorA)).toBe(true);
  const stored = cache.getQueryData<InfiniteData<Page>>(['hostel-bookings', actorA, branchId]);
  expect(stored?.pages[0]?.data[0]?.state).toBe('confirmed');
});
test('BKG-009: invalid action reasons never reach the transition API', async () => {
  const { result } = await show();
  await waitFor(() => expect(result.current.access.isSuccess).toBe(true));
  await act(async () => {
    await expect(
      result.current.action.mutateAsync({ id: actorB, action: 'cancel', reason: ' ' }),
    ).rejects.toThrow();
  });
  expect(transitionHostelBooking).not.toHaveBeenCalled();
});
test('SEC-003: a stale native account binding cannot issue a management mutation', async () => {
  const { result } = await show();
  await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
  jest.mocked(actorClient).mockRejectedValue(new Error('Account changed'));
  await act(async () => {
    await expect(
      result.current.action.mutateAsync({ id: actorB, action: 'confirm', reason: 'Reviewed' }),
    ).rejects.toThrow('Account changed');
  });
  expect(transitionHostelBooking).not.toHaveBeenCalled();
});
