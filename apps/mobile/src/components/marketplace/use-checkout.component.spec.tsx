/// <reference types="jest" />
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createBookingHold, createCustomerBooking } from '@hsm/api-client';
import { bookingQuoteSnapshotSchema, type CreateBookingInput } from '@hsm/contracts';
import { actorClient, client } from '../../lib/runtime';
import { useCheckout } from './use-checkout';
jest.mock('../../lib/runtime', () => ({ client: {}, actorClient: jest.fn() }));
jest.mock('expo-crypto', () => {
  let sequence = 0;
  return { randomUUID: () => '019a1234-1234-7123-8123-' + String(++sequence).padStart(12, '0') };
});
jest.mock('@hsm/api-client', () => ({
  createBookingHold: jest.fn(),
  createCustomerBooking: jest.fn(),
}));
const actorId = '019a1234-1234-7123-8123-123456789abc';
const branchId = actorId,
  roomId = actorId,
  policyId = actorId;
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
function booking() {
  return {
    id: actorId,
    branchId,
    reference: 'HSM-' + actorId.replaceAll('-', '').toUpperCase(),
    state: 'pending_request' as const,
    quote,
    createdAt: '2026-10-15T10:00:00Z',
    requestExpiresAt: '2026-10-15T11:00:00Z',
    documents: [],
    upfront: null,
  };
}
test('BKG-001: booking retry retains its key and only actual server state becomes a result', async () => {
  jest
    .mocked(createCustomerBooking)
    .mockRejectedValueOnce(new Error('Interrupted'))
    .mockResolvedValueOnce(booking());
  const hook = await renderHook(() => useCheckout(actorId, branchId, quote), { wrapper });
  const input: CreateBookingInput = { quote, documents: [] };
  await act(async () => {
    await expect(hook.result.current.book.mutateAsync(input)).rejects.toThrow('Interrupted');
  });
  expect(hook.result.current.result).toBeUndefined();
  await act(async () => {
    await hook.result.current.book.mutateAsync(input);
  });
  expect(createCustomerBooking).toHaveBeenCalledTimes(2);
  expect(jest.mocked(createCustomerBooking).mock.calls[0]?.[3]).toBe(
    jest.mocked(createCustomerBooking).mock.calls[1]?.[3],
  );
  await waitFor(() => expect(hook.result.current.result?.state).toBe('pending_request'));
});
test('BKG-001: changed booking command cannot accidentally reuse a failed command key', async () => {
  jest.mocked(createCustomerBooking).mockRejectedValue(new Error('Interrupted'));
  const hook = await renderHook(() => useCheckout(actorId, branchId, quote), { wrapper });
  for (const input of [
    { quote, documents: [] },
    { quote, documents: [], holdId: actorId },
  ]) {
    await act(async () => {
      await expect(hook.result.current.book.mutateAsync(input)).rejects.toThrow('Interrupted');
    });
  }
  expect(jest.mocked(createCustomerBooking).mock.calls[0]?.[3]).not.toBe(
    jest.mocked(createCustomerBooking).mock.calls[1]?.[3],
  );
});
test('ACC-001: hold retries retain the command key and never create a booking result', async () => {
  const held = { id: actorId, branchId, quote, expiresAt: '2026-10-15T10:10:00Z' };
  jest
    .mocked(createBookingHold)
    .mockRejectedValueOnce(new Error('Interrupted'))
    .mockResolvedValueOnce(held);
  const hook = await renderHook(() => useCheckout(actorId, branchId, quote), { wrapper });
  await act(async () => {
    await expect(hook.result.current.hold.mutateAsync()).rejects.toThrow('Interrupted');
  });
  await act(async () => {
    await hook.result.current.hold.mutateAsync();
  });
  expect(createBookingHold).toHaveBeenCalledTimes(2);
  expect(jest.mocked(createBookingHold).mock.calls[0]?.[3]).toBe(
    jest.mocked(createBookingHold).mock.calls[1]?.[3],
  );
  await waitFor(() => expect(hook.result.current.hold.data).toEqual(held));
  expect(hook.result.current.result).toBeUndefined();
  expect(createCustomerBooking).not.toHaveBeenCalled();
});

test('SEC-003 / AUTH-C-005: changed credentials reject before a previous account private booking is sent', async () => {
  jest.mocked(actorClient).mockRejectedValue(new Error('Account changed'));
  jest.mocked(createCustomerBooking).mockResolvedValue(booking());
  const hook = await renderHook(() => useCheckout(actorId, branchId, quote), { wrapper });
  await act(async () => {
    await expect(
      hook.result.current.book.mutateAsync({
        quote,
        documents: [],
        permanentAddress: 'Previous account private address',
      }),
    ).rejects.toThrow('Account changed');
  });
  expect(createCustomerBooking).not.toHaveBeenCalled();
});
