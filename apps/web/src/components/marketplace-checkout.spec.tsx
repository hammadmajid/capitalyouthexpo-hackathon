import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ApiFailure,
  createBookingHold,
  createCustomerBooking,
  ownBookingDocuments,
} from '@hsm/api-client';
import type { BookingQuoteSnapshot } from '@hsm/contracts';
import { MarketplaceCheckout } from './marketplace-checkout';
import {
  checkoutQuote as quote,
  checkoutBranchId as branchId,
  checkoutActorId as actorId,
  checkoutBooking as booking,
} from './checkout.fixture';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  createBookingHold: vi.fn(),
  createCustomerBooking: vi.fn(),
  ownBookingDocuments: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
const fileId = randomUUID();
vi.mock('./booking-evidence-picker', () => ({
  BookingEvidencePicker: ({
    onReady,
    disabled,
  }: {
    onReady: (id: string) => void;
    disabled: boolean;
  }) => (
    <button disabled={disabled} onClick={() => onReady(fileId)}>
      Persisted evidence fixture
    </button>
  ),
  bookingEvidenceLabels: {
    student_id: 'Student ID',
    cnic: 'CNIC document',
    admission_proof: 'Admission proof',
    employment_proof: 'Employment proof',
  },
}));
const caches: QueryClient[] = [];
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(createCustomerBooking).mockResolvedValue(booking);
  vi.mocked(ownBookingDocuments).mockResolvedValue({ data: [], nextCursor: null });
});
afterEach(() => {
  cleanup();
  caches.splice(0).forEach((cache) => cache.clear());
});
function setup(initial: BookingQuoteSnapshot = quote) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  caches.push(cache);
  const onBusy = vi.fn();
  const tree = (
    actor = actorId,
    branch = branchId,
    current = initial,
    accessUnavailable = false,
  ) => (
    <QueryClientProvider client={cache}>
      <MarketplaceCheckout
        actorId={actor}
        branchId={branch}
        quote={current}
        onBusy={onBusy}
        accessUnavailable={accessUnavailable}
      />
    </QueryClientProvider>
  );
  return { ...render(tree()), tree, cache, onBusy };
}
const agree = () => fireEvent.click(screen.getByRole('checkbox'));
const send = () => fireEvent.click(screen.getByRole('button', { name: 'Send booking request' }));
const setAddress = (value = 'House 10, Street 2, Islamabad') =>
  fireEvent.change(screen.getByLabelText('Private permanent address'), { target: { value } });
it('BKG-001 / CHG-007: checkout is explicit, retains optional CNIC policy and never invents a hold or booking', () => {
  setup();
  expect(screen.queryByLabelText('Private CNIC number')).toBeNull();
  send();
  expect(createCustomerBooking).not.toHaveBeenCalled();
  expect(createBookingHold).not.toHaveBeenCalled();
  expect(screen.getByText(/Rent and deposits are paid directly/)).toBeDefined();
});
it('BKG-004: only matching persisted success displays the reference; pending state cannot claim confirmation or payment', async () => {
  let finish: ((value: typeof booking) => void) | undefined;
  vi.mocked(createCustomerBooking).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  setup();
  agree();
  setAddress();
  send();
  await waitFor(() => expect(createCustomerBooking).toHaveBeenCalledTimes(1));
  expect(screen.queryByText('Booking request sent')).toBeNull();
  expect((screen.getByLabelText('Private permanent address') as HTMLTextAreaElement).disabled).toBe(
    true,
  );
  finish?.(booking);
  await screen.findByText('Booking request sent');
  expect(screen.getByText(booking.reference)).toBeDefined();
  expect(screen.queryByLabelText('Private permanent address')).toBeNull();
  expect(document.body.textContent).not.toMatch(/Paid|Booking confirmed/);
  expect(vi.mocked(createCustomerBooking).mock.calls[0]?.[2].permanentAddress).toBe(
    'House 10, Street 2, Islamabad',
  );
});
it('BKG-001: invalid permanent address fails before a request', () => {
  setup();
  agree();
  setAddress('abc');
  send();
  expect(screen.getByRole('alert')).toBeDefined();
  expect(createCustomerBooking).not.toHaveBeenCalled();
});
it('BKG-001: an identical interrupted booking keeps its command key and private address', async () => {
  vi.mocked(createCustomerBooking).mockRejectedValue(new Error('Private provider detail'));
  setup();
  agree();
  setAddress();
  send();
  await screen.findByRole('alert');
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Send booking request' }) as HTMLButtonElement).disabled,
    ).toBe(false),
  );
  expect((screen.getByLabelText('Private permanent address') as HTMLTextAreaElement).value).toBe(
    'House 10, Street 2, Islamabad',
  );
  send();
  await waitFor(() => expect(createCustomerBooking).toHaveBeenCalledTimes(2));
  const calls = vi.mocked(createCustomerBooking).mock.calls;
  expect(calls[1]?.[3]).toBe(calls[0]?.[3]);
  expect(document.body.textContent).not.toContain('Private provider detail');
});
it('BKG-001: edited normalized booking input receives a different command key', async () => {
  vi.mocked(createCustomerBooking).mockRejectedValue(new Error('Offline'));
  setup();
  agree();
  setAddress();
  send();
  await screen.findByRole('alert');
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Send booking request' }) as HTMLButtonElement).disabled,
    ).toBe(false),
  );
  setAddress('House 11, Street 2, Islamabad');
  send();
  await waitFor(() => expect(createCustomerBooking).toHaveBeenCalledTimes(2));
  const calls = vi.mocked(createCustomerBooking).mock.calls;
  expect(calls[1]?.[3]).not.toBe(calls[0]?.[3]);
});
it.each([
  { ...booking, branchId: randomUUID() },
  { ...booking, quote: { ...quote, price: { ...quote.price, monthlyRentPaisa: 1 } } },
  { ...booking, state: 'confirmed' as const },
])(
  'SEC-003: foreign branch, altered terms and unexpected state never become checkout success %#',
  async (response) => {
    vi.mocked(createCustomerBooking).mockResolvedValue(response);
    setup();
    agree();
    send();
    await screen.findByRole('alert');
    expect(screen.queryByText('Booking request sent')).toBeNull();
    expect(screen.queryByText(booking.reference)).toBeNull();
  },
);
it('BKG-002: a real matched hold is passed to booking without displaying its internal ID', async () => {
  const holdId = randomUUID();
  vi.mocked(createBookingHold).mockResolvedValue({
    id: holdId,
    branchId,
    quote: { ...quote, quotedAt: '2026-10-17T00:02:00.000Z' },
    expiresAt: '2026-10-17T00:12:00.000Z',
  });
  setup();
  agree();
  fireEvent.click(screen.getByRole('button', { name: 'Temporarily hold this inventory' }));
  await screen.findByText(/Temporary hold expiry/);
  expect(document.body.textContent).not.toContain(holdId);
  send();
  await screen.findByText('Booking request sent');
  expect(vi.mocked(createCustomerBooking).mock.calls[0]?.[2].holdId).toBe(holdId);
});
it('BKG-002: an interrupted hold retries with its original key', async () => {
  vi.mocked(createBookingHold).mockRejectedValue(new Error('Offline'));
  setup();
  agree();
  fireEvent.click(screen.getByRole('button', { name: 'Temporarily hold this inventory' }));
  await screen.findByRole('alert');
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Temporarily hold this inventory' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Temporarily hold this inventory' }));
  await waitFor(() => expect(createBookingHold).toHaveBeenCalledTimes(2));
  const calls = vi.mocked(createBookingHold).mock.calls;
  expect(calls[1]?.[3]).toBe(calls[0]?.[3]);
});
it('SEC-003: changing actor, branch or quote clears private checkout inputs and consent', () => {
  const value = setup();
  agree();
  setAddress();
  value.rerender(value.tree(randomUUID(), randomUUID()));
  expect((screen.getByLabelText('Private permanent address') as HTMLTextAreaElement).value).toBe(
    '',
  );
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
});
it('SEC-003: transient authentication refresh preserves the draft while blocking changes', () => {
  const value = setup();
  agree();
  setAddress();
  value.rerender(value.tree(actorId, branchId, quote, true));
  expect((screen.getByLabelText('Private permanent address') as HTMLTextAreaElement).value).toBe(
    'House 10, Street 2, Islamabad',
  );
  expect(
    (screen.getByRole('button', { name: 'Send booking request' }) as HTMLButtonElement).disabled,
  ).toBe(true);
});
it('SEC-003: definitive access denial hides private inputs and all booking controls', async () => {
  vi.mocked(createCustomerBooking).mockRejectedValue(
    new ApiFailure({
      type: 'about:blank',
      title: 'Denied',
      detail: 'Denied',
      traceId: randomUUID(),
      code: 'SESSION_REVOKED',
      status: 401,
    }),
  );
  setup();
  agree();
  setAddress();
  send();
  await screen.findByRole('alert');
  expect(screen.queryByLabelText('Private permanent address')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Send booking request' })).toBeNull();
});
function reviewed(state: 'pending' | 'accepted' | 'rejected' = 'pending') {
  return {
    id: randomUUID(),
    branchId,
    bookingId: null,
    kind: 'student_id' as const,
    state,
    createdAt: '2026-10-17T00:00:00.000Z',
    reviewedAt: state === 'pending' ? null : '2026-10-17T00:01:00.000Z',
    rejectionCode: state === 'rejected' ? 'unreadable' : null,
    fileId,
    consumedAt: null,
  };
}
it('BKG-005: instant confirmation waits for actual accepted Owner review, never just a clean upload', async () => {
  const current = {
    ...quote,
    policy: {
      ...quote.policy,
      bookingMode: 'instant' as const,
      requiredDocuments: ['student_id' as const],
      documentReviewRequired: true,
    },
  };
  vi.mocked(ownBookingDocuments).mockResolvedValue({ data: [reviewed()], nextCursor: null });
  const value = setup(current);
  agree();
  fireEvent.click(screen.getByRole('button', { name: 'Persisted evidence fixture' }));
  await waitFor(() => expect(ownBookingDocuments).toHaveBeenCalled());
  expect(
    (screen.getByRole('button', { name: 'Confirm booking' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  vi.mocked(ownBookingDocuments).mockResolvedValue({
    data: [reviewed('accepted')],
    nextCursor: null,
  });
  await value.cache.invalidateQueries({ queryKey: ['booking-evidence', actorId, branchId] });
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Confirm booking' }) as HTMLButtonElement).disabled,
    ).toBe(false),
  );
  expect(createCustomerBooking).not.toHaveBeenCalled();
});
it('BKG-005: known rejected evidence cannot submit a request either', async () => {
  vi.mocked(ownBookingDocuments).mockResolvedValue({
    data: [reviewed('rejected')],
    nextCursor: null,
  });
  setup({ ...quote, policy: { ...quote.policy, requiredDocuments: ['student_id'] } });
  agree();
  fireEvent.click(screen.getByRole('button', { name: 'Persisted evidence fixture' }));
  await screen.findByText('Student ID: rejected');
  expect(
    (screen.getByRole('button', { name: 'Send booking request' }) as HTMLButtonElement).disabled,
  ).toBe(true);
});
it('SEC-003: branch-mismatched evidence cannot enable document selection or booking', async () => {
  vi.mocked(ownBookingDocuments).mockResolvedValue({
    data: [{ ...reviewed('accepted'), branchId: randomUUID() }],
    nextCursor: null,
  });
  setup({ ...quote, policy: { ...quote.policy, requiredDocuments: ['student_id'] } });
  await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: /Use accepted/ })).toBeNull();
  expect(
    (screen.getByRole('button', { name: 'Persisted evidence fixture' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    (screen.getByRole('button', { name: 'Send booking request' }) as HTMLButtonElement).disabled,
  ).toBe(true);
});
