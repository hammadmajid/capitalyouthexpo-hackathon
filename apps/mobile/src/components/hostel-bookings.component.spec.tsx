/// <reference types="jest" />
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { ApiFailure } from '@hsm/api-client';
import { bookingQuoteSnapshotSchema, bookingSummarySchema } from '@hsm/contracts';
import { HostelBookings } from './hostel-bookings';
jest.mock('../lib/runtime', () => ({ actorClient: jest.fn() }));
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
const booking = bookingSummarySchema.parse({
  id: actorB,
  branchId,
  reference: 'HSM-' + actorB.replaceAll('-', '').toUpperCase(),
  state: 'pending_request',
  quote,
  createdAt: '2026-10-15T10:00:00Z',
  requestExpiresAt: '2026-10-15T11:00:00Z',
  documents: [{ kind: 'student_id', state: 'accepted' }],
  upfront: null,
});
type Booking = typeof booking;
function query(rows: Booking[] = [booking]) {
  return {
    isPending: false,
    error: null as unknown,
    data: { pages: [{ data: rows, nextCursor: actorB }] } as
      { pages: { data: Booking[]; nextCursor: string | null }[] } | undefined,
    isFetching: false,
    hasNextPage: true,
    isFetchingNextPage: false,
    refetch: jest.fn(),
    fetchNextPage: jest.fn(),
  };
}
function access() {
  return {
    data: { permissions: ['booking_manage'] },
    error: null as unknown,
    isFetching: false,
    refetch: jest.fn(),
  };
}
const mockState = {
  query: query(),
  access: access(),
  action: { isPending: false, error: null as unknown, mutate: jest.fn(), reset: jest.fn() },
};
const mockUseHostelBookings = jest.fn((actor: string, branch: string, onSaved: () => void) => {
  void actor;
  void branch;
  void onSaved;
  return mockState;
});
jest.mock('./use-hostel-bookings', () => ({
  nativeScopeDenied:
    jest.requireActual<typeof import('./use-hostel-bookings')>('./use-hostel-bookings')
      .nativeScopeDenied,
  useHostelBookings: (actor: string, branch: string, onSaved: () => void) =>
    mockUseHostelBookings(actor, branch, onSaved),
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockState.query = query();
  mockState.access = access();
  mockState.action.isPending = false;
  mockState.action.error = null;
});
async function open() {
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'Confirm request' }));
  await user.type(screen.getByLabelText('Booking action reason'), 'Reviewed requirements');
  return user;
}
test('BKG-001 / SEC-003: native management displays agreed prices and document status without evidence content or payment claims', async () => {
  await render(<HostelBookings actorId={actorA} branchId={branchId} />);
  expect(mockUseHostelBookings).toHaveBeenCalledWith(actorA, branchId, expect.any(Function));
  expect(screen.getByText('Status: pending request')).toBeVisible();
  expect(screen.getByText('Rent PKR 18,000.01/month')).toBeVisible();
  expect(screen.getByText('student id: accepted')).toBeVisible();
  expect(screen.queryByText('Paid')).toBeNull();
  expect(screen.queryByRole('link')).toBeNull();
});
test('ACC-004: missing booking_manage grant keeps status readable and removes mutation controls', async () => {
  mockState.access.data.permissions = [];
  await render(<HostelBookings actorId={actorA} branchId={branchId} />);
  expect(screen.getByText('Status: pending request')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Confirm request' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Reject request' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Cancel booking' })).toBeNull();
});
test('BKG-001: confirmation requires a reason and waits for the persisted result', async () => {
  await render(<HostelBookings actorId={actorA} branchId={branchId} />);
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'Confirm request' }));
  expect(screen.getByRole('button', { name: 'Submit confirmation' })).toBeDisabled();
  await user.type(screen.getByLabelText('Booking action reason'), 'Reviewed requirements');
  await user.press(screen.getByRole('button', { name: 'Submit confirmation' }));
  expect(mockState.action.mutate).toHaveBeenCalledWith({
    id: actorB,
    action: 'confirm',
    reason: 'Reviewed requirements',
  });
  expect(screen.getByText('Status: pending request')).toBeVisible();
  expect(screen.queryByText('Saved')).toBeNull();
  await act(() => {
    mockState.query = query([{ ...booking, state: 'confirmed' }]);
    mockUseHostelBookings.mock.calls.at(-1)?.[2]();
  });
  expect(screen.getByText('Status: confirmed')).toBeVisible();
  expect(screen.getByText('Saved')).toBeVisible();
  expect(screen.queryByLabelText('Booking action reason')).toBeNull();
});
test('SEC-003: a permissions refresh outage retains the reason and disables submission', async () => {
  const mounted = await render(<HostelBookings actorId={actorA} branchId={branchId} />);
  await open();
  mockState.access.error = new Error('Offline');
  await mounted.rerender(<HostelBookings actorId={actorA} branchId={branchId} />);
  expect(screen.getByLabelText('Booking action reason')).toHaveDisplayValue(
    'Reviewed requirements',
  );
  expect(screen.getByRole('button', { name: 'Submit confirmation' })).toBeDisabled();
  expect(screen.getByLabelText('Booking action reason')).toBeDisabled();
});
test('SEC-003: revoked branch authority hides stale booking records and the reason', async () => {
  const mounted = await render(<HostelBookings actorId={actorA} branchId={branchId} />);
  await open();
  mockState.action.error = new ApiFailure({
    type: 'https://example.test/problem',
    title: 'Denied',
    status: 403,
    code: 'BRANCH_FORBIDDEN',
    detail: 'Unavailable',
    traceId: 'fixture',
  });
  await mounted.rerender(<HostelBookings actorId={actorA} branchId={branchId} />);
  expect(screen.queryByText(booking.reference)).toBeNull();
  expect(screen.queryByLabelText('Booking action reason')).toBeNull();
  expect(screen.getByRole('alert')).toBeVisible();
});
test.each(['actor', 'branch'] as const)(
  'SEC-003: changing %s clears the private action reason',
  async (kind) => {
    const mounted = await render(<HostelBookings actorId={actorA} branchId={branchId} />);
    await open();
    await mounted.rerender(
      <HostelBookings
        actorId={kind === 'actor' ? actorB : actorA}
        branchId={kind === 'branch' ? actorB : branchId}
      />,
    );
    expect(screen.queryByLabelText('Booking action reason')).toBeNull();
    expect(screen.getByRole('button', { name: 'Confirm request' })).toBeVisible();
  },
);
test('BKG-001: a request removed by refresh cannot retarget an open confirmation', async () => {
  const mounted = await render(<HostelBookings actorId={actorA} branchId={branchId} />);
  await open();
  mockState.query = query([
    { ...booking, id: actorA, reference: 'HSM-' + actorA.replaceAll('-', '').toUpperCase() },
  ]);
  await mounted.rerender(<HostelBookings actorId={actorA} branchId={branchId} />);
  expect(screen.getByText('This booking action is no longer available.')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Submit confirmation' })).toBeNull();
  expect(mockState.action.mutate).not.toHaveBeenCalled();
});
test('BKG-001: loading and failed initial history are never shown as an empty branch', async () => {
  mockState.query.isPending = true;
  const mounted = await render(<HostelBookings actorId={actorA} branchId={branchId} />);
  expect(screen.getByLabelText('Loading branch bookings…')).toBeVisible();
  mockState.query.isPending = false;
  mockState.query.data = undefined;
  mockState.query.error = new Error('Offline');
  await mounted.rerender(<HostelBookings actorId={actorA} branchId={branchId} />);
  expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  expect(screen.queryByText('No bookings yet')).toBeNull();
});
test('BKG-001: native queue uses actual pagination and keeps terminal records read-only', async () => {
  mockState.query = query([{ ...booking, state: 'cancelled' }]);
  await render(<HostelBookings actorId={actorA} branchId={branchId} />);
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'More branch bookings' }));
  expect(mockState.query.fetchNextPage).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'Cancel booking' })).toBeNull();
  expect(screen.queryByRole('button', { name: /^(Retry|Refresh|Reload)\b/ })).toBeNull();
});
test('STAY-001: a checked-in booking shows its linked Stay instead of the check-in action', async () => {
  const stayId = '99999999-9999-4999-8999-999999999999';
  mockState.access.data.permissions = ['stay_manage', 'rent_manage', 'finance_view'];
  mockState.query = query([
    { ...booking, state: 'confirmed', stay: { id: stayId, state: 'active' } } as Booking,
  ]);
  await render(<HostelBookings actorId={actorA} branchId={branchId} />);
  expect(screen.getByText('Checked in · active')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Check in resident' })).toBeNull();
});
