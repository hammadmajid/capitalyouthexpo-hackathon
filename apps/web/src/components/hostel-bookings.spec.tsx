import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { bookingQuoteSnapshotSchema, bookingSummarySchema } from '@hsm/contracts';
import {
  ApiFailure,
  listHostelBookings,
  transitionHostelBooking,
  readInventoryAccess,
} from '@hsm/api-client';
import { HostelBookings } from './hostel-bookings';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  listHostelBookings: vi.fn(),
  transitionHostelBooking: vi.fn(),
  readInventoryAccess: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
const branchId = randomUUID(),
  roomId = randomUUID(),
  policyId = randomUUID(),
  id = randomUUID();
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
const booking = bookingSummarySchema.parse({
  id,
  branchId,
  reference: 'HSM-' + id.replaceAll('-', '').toUpperCase(),
  state: 'pending_request',
  quote,
  createdAt: '2026-10-14T12:00:00Z',
  requestExpiresAt: '2026-10-14T13:00:00Z',
  documents: [],
  upfront: null,
});
const actorId = randomUUID();
const caches: QueryClient[] = [];
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listHostelBookings).mockResolvedValue({ data: [booking], nextCursor: null });
  vi.mocked(readInventoryAccess).mockResolvedValue({
    branchId,
    permissions: ['booking_manage'],
    canConfigureManagers: false,
  });
});
afterEach(() => {
  cleanup();
  for (const cache of caches.splice(0)) cache.clear();
});
function show(queue?: 'pending_requests') {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  caches.push(cache);
  return {
    ...render(
      <QueryClientProvider client={cache}>
        <HostelBookings actorId={actorId} branchId={branchId} {...(queue ? { queue } : {})} />
      </QueryClientProvider>,
    ),
    cache,
  };
}
it('ACC-004: exact-branch history displays actual state and document status without private downloads', async () => {
  show();
  expect(await screen.findByText('Status: pending request')).toBeDefined();
  expect(listHostelBookings).toHaveBeenCalledWith({}, branchId, { limit: 20 });
  expect(readInventoryAccess).toHaveBeenCalledWith({}, branchId);
  expect(document.body.textContent).not.toContain(actorId);
  expect(screen.queryByRole('link')).toBeNull();
});
it('ACC-004 / CHG-008: a Manager without the booking grant sees statuses and no mutation controls', async () => {
  vi.mocked(readInventoryAccess).mockResolvedValue({
    branchId,
    permissions: [],
    canConfigureManagers: false,
  });
  show();
  await screen.findByText('Status: pending request');
  await waitFor(() => expect(readInventoryAccess).toHaveBeenCalledOnce());
  expect(screen.queryByRole('button', { name: 'Confirm request' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Reject request' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Cancel booking' })).toBeNull();
});
it('BKG-004: confirmation waits for actual server commit and refreshes branch history', async () => {
  let finish!: (value: typeof booking) => void;
  const pending = new Promise<typeof booking>((resolve) => {
    finish = resolve;
  });
  vi.mocked(transitionHostelBooking).mockReturnValue(pending);
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm request' }));
  fireEvent.change(screen.getByLabelText('Reason for confirmation'), {
    target: { value: 'Requirements checked' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Submit confirmation' }));
  expect(await screen.findByRole('button', { name: 'Saving booking...' })).toBeDefined();
  expect(screen.getByText('Status: pending request')).toBeDefined();
  const accepted = { ...booking, state: 'confirmed' as const };
  vi.mocked(listHostelBookings).mockResolvedValue({ data: [accepted], nextCursor: null });
  finish(accepted);
  expect(await screen.findByText('Status: confirmed')).toBeDefined();
  expect(transitionHostelBooking).toHaveBeenCalledWith(
    {},
    branchId,
    booking.id,
    'confirm',
    'Requirements checked',
    expect.any(String),
  );
});
it('BKG-004: failed cancellation retries retain the command key', async () => {
  vi.mocked(transitionHostelBooking).mockRejectedValue(new Error('Interrupted'));
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel booking' }));
  fireEvent.change(screen.getByLabelText('Reason for cancellation'), {
    target: { value: 'Customer request' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Submit cancellation' }));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Submit cancellation' }));
  await waitFor(() => expect(transitionHostelBooking).toHaveBeenCalledTimes(2));
  expect(vi.mocked(transitionHostelBooking).mock.calls[0]?.[5]).toBe(
    vi.mocked(transitionHostelBooking).mock.calls[1]?.[5],
  );
});
it('BKG-001: history errors remain distinguishable from an empty branch and can be retried', async () => {
  vi.mocked(listHostelBookings)
    .mockRejectedValueOnce(new Error('Unavailable'))
    .mockResolvedValue({ data: [], nextCursor: null });
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Retry branch bookings' }));
  expect(await screen.findByText('No bookings are available for this branch.')).toBeDefined();
});

it('ACC-004 / SEC-003: switching branch clears the previous booking action form and reason', async () => {
  const mounted = show(),
    nextBranch = randomUUID();
  fireEvent.click(await screen.findByRole('button', { name: 'Reject request' }));
  fireEvent.change(screen.getByLabelText('Reason for rejection'), {
    target: { value: 'Previous private reason' },
  });
  vi.mocked(listHostelBookings).mockResolvedValue({
    data: [{ ...booking, branchId: nextBranch }],
    nextCursor: null,
  });
  vi.mocked(readInventoryAccess).mockResolvedValue({
    branchId: nextBranch,
    permissions: ['booking_manage'],
    canConfigureManagers: false,
  });
  mounted.rerender(
    <QueryClientProvider client={mounted.cache}>
      <HostelBookings actorId={actorId} branchId={nextBranch} />
    </QueryClientProvider>,
  );
  await screen.findByText('Status: pending request');
  expect(screen.queryByDisplayValue('Previous private reason')).toBeNull();
  expect(screen.queryByLabelText('Reason for rejection')).toBeNull();
  expect(listHostelBookings).toHaveBeenLastCalledWith({}, nextBranch, { limit: 20 });
});

it('ACC-004 / SEC-003: failed permission refresh hides cached booking actions until current access returns, retaining the entered draft', async () => {
  const mounted = show();
  fireEvent.click(await screen.findByRole('button', { name: 'Reject request' }));
  fireEvent.change(screen.getByLabelText('Reason for rejection'), {
    target: { value: 'Retain this reason' },
  });
  vi.mocked(readInventoryAccess).mockRejectedValue(
    new ApiFailure({
      type: 'https://example.test/problems/branch-forbidden',
      title: 'Forbidden',
      status: 403,
      code: 'BRANCH_FORBIDDEN',
      detail: 'Unavailable',
      traceId: 'test-trace',
    }),
  );
  await act(async () => {
    await mounted.cache.invalidateQueries({
      queryKey: ['inventory-access', actorId, branchId],
      exact: true,
    });
  });
  expect(await screen.findByRole('button', { name: 'Retry booking permissions' })).toBeDefined();
  expect(screen.queryByRole('button', { name: 'Submit rejection' })).toBeNull();
  expect(screen.queryByLabelText('Reason for rejection')).toBeNull();
  expect(screen.queryByText('Status: pending request')).toBeNull();
  expect(transitionHostelBooking).not.toHaveBeenCalled();
  vi.mocked(readInventoryAccess).mockResolvedValue({
    branchId,
    permissions: ['booking_manage'],
    canConfigureManagers: false,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Retry booking permissions' }));
  expect(await screen.findByDisplayValue('Retain this reason')).toBeDefined();
});
it('STAY-001: a checked-in booking shows its linked Stay instead of the check-in action', async () => {
  const stayId = '99999999-9999-4999-8999-999999999999';
  vi.mocked(readInventoryAccess).mockResolvedValue({
    branchId,
    permissions: ['stay_manage', 'rent_manage', 'finance_view'],
    canConfigureManagers: false,
  });
  vi.mocked(listHostelBookings).mockResolvedValue({
    data: [
      { ...booking, id: stayId.replaceAll('9', '8'), state: 'confirmed', stay: null },
      { ...booking, state: 'confirmed', stay: { id: stayId, state: 'active' } },
    ],
    nextCursor: null,
  });
  show();
  expect(await screen.findByText('Checked in. Stay active: ' + stayId)).toBeDefined();
  await waitFor(() =>
    expect(screen.getAllByRole('button', { name: 'Check in resident' })).toHaveLength(1),
  );
});

it.each([undefined, 'pending_requests'] as const)(
  'AUD-009 / BKG-004: a decision in %s refreshes the sibling queue and dashboard counts only in this actor scope',
  async (queue) => {
    const accepted = { ...booking, state: 'confirmed' as const };
    vi.mocked(transitionHostelBooking).mockResolvedValue(accepted);
    const { cache } = show(queue);
    const sibling = ['hostel-bookings', actorId, branchId, ...(queue ? [] : ['pending_requests'])];
    const owner = ['owner-dashboard', actorId, ''];
    const branch = ['branch-dashboard', actorId, branchId];
    const foreign = ['branch-dashboard', actorId, randomUUID()];
    const otherActor = ['owner-dashboard', randomUUID(), ''];
    for (const key of [sibling, owner, branch, foreign, otherActor])
      cache.setQueryData(key, { fixture: true });
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm request' }));
    fireEvent.change(screen.getByLabelText('Reason for confirmation'), {
      target: { value: 'Checked requirements' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit confirmation' }));
    await waitFor(() => {
      expect(cache.getQueryState(sibling)?.isInvalidated).toBe(true);
      expect(cache.getQueryState(owner)?.isInvalidated).toBe(true);
      expect(cache.getQueryState(branch)?.isInvalidated).toBe(true);
    });
    expect(cache.getQueryState(foreign)?.isInvalidated).toBe(false);
    expect(cache.getQueryState(otherActor)?.isInvalidated).toBe(false);
  },
);
