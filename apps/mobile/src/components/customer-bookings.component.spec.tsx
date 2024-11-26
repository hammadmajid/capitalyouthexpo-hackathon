/// <reference types="jest" />
import { render, screen, userEvent } from '@testing-library/react-native';
import { CustomerBookings } from './customer-bookings';
const actorId = '019a1234-1234-7123-8123-123456789abc',
  id = '019a1234-1234-7123-8123-123456789abd';
function booking(state = 'confirmed', cancellationAllowed = true) {
  return {
    id,
    reference: 'HSM-PRIVATE-BOOKING',
    state,
    documents: [{ kind: 'student_id', state: 'accepted' }],
    quote: {
      listing: { hostelName: 'Actual hostel', branchName: 'Actual branch' },
      range: { moveInDate: '2026-11-01', moveOutDate: '2026-11-03' },
      price: { monthlyRentPaisa: 1800001 },
      policy: { cancellationAllowed },
    },
  };
}
function query() {
  return {
    isPending: false,
    isError: false,
    error: null as unknown,
    data: { pages: [{ data: [booking()], nextCursor: id }] },
    hasNextPage: true,
    isFetchingNextPage: false,
    refetch: jest.fn(),
    fetchNextPage: jest.fn(),
  };
}
const mockState = {
  query: query(),
  cancel: {
    isPending: false,
    isError: false,
    error: null as unknown,
    mutate: jest.fn(),
    reset: jest.fn(),
  },
};
const mockUseBookings = jest.fn((actor: string) => {
  void actor;
  return mockState;
});
jest.mock('./use-bookings', () => ({ useBookings: (actor: string) => mockUseBookings(actor) }));
beforeEach(() => {
  jest.clearAllMocks();
  mockState.query = query();
  mockState.cancel.isPending = false;
  mockState.cancel.isError = false;
  mockState.cancel.error = null;
});
test('BKG-001: loading cannot masquerade as no bookings', async () => {
  mockState.query.isPending = true;
  await render(<CustomerBookings actorId={actorId} />);
  expect(screen.getByLabelText('Loading your bookings…')).toBeVisible();
  expect(screen.queryByText('You have no bookings yet.')).toBeNull();
});
test('SEC-003: actual own server state and evidence status render without payment claims', async () => {
  await render(<CustomerBookings actorId={actorId} />);
  expect(mockUseBookings).toHaveBeenCalledWith(actorId);
  expect(screen.getByText('Actual hostel')).toBeVisible();
  expect(screen.getByText('Status: confirmed')).toBeVisible();
  expect(screen.getByText('student id: accepted')).toBeVisible();
  expect(screen.queryByText('Paid')).toBeNull();
});
test('BKG-009: cancellation requires reason and never optimistically changes persisted status', async () => {
  await render(<CustomerBookings actorId={actorId} />);
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'Cancel booking' }));
  expect(screen.getByRole('button', { name: 'Confirm cancellation' })).toBeDisabled();
  await user.type(screen.getByLabelText('Cancellation reason'), 'Change of plans');
  await user.press(screen.getByRole('button', { name: 'Confirm cancellation' }));
  expect(mockState.cancel.mutate).toHaveBeenCalledWith(
    { id, reason: 'Change of plans' },
    { onSuccess: expect.any(Function) },
  );
  expect(screen.getByText('Status: confirmed')).toBeVisible();
  expect(screen.queryByText('Status: cancelled')).toBeNull();
});
test.each<[string, boolean]>([
  ['cancelled', true],
  ['confirmed', false],
])('BKG-009: server state/policy %s/%s does not offer cancellation', async (state, allowed) => {
  mockState.query.data.pages[0] = { data: [booking(state, allowed)], nextCursor: id };
  await render(<CustomerBookings actorId={actorId} />);
  expect(screen.queryByRole('button', { name: 'Cancel booking' })).toBeNull();
});
test('BKG-001: actual cursor controls load-more and empty response stays truthful', async () => {
  await render(<CustomerBookings actorId={actorId} />);
  await userEvent.setup().press(screen.getByRole('button', { name: 'More bookings' }));
  expect(mockState.query.fetchNextPage).toHaveBeenCalledTimes(1);
});
test('BKG-001: empty server history displays no invented rows or pagination', async () => {
  mockState.query.data.pages[0] = { data: [], nextCursor: id };
  mockState.query.hasNextPage = false;
  await render(<CustomerBookings actorId={actorId} />);
  expect(screen.getByText('You have no bookings yet.')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'More bookings' })).toBeNull();
});
test('SEC-003: failed private query hides stale bookings and safe retry does not disclose provider text', async () => {
  mockState.query.isError = true;
  mockState.query.error = new Error('Private provider connection');
  await render(<CustomerBookings actorId={actorId} />);
  expect(screen.queryByText('Actual hostel')).toBeNull();
  expect(screen.queryByText('Private provider connection')).toBeNull();
  // Pull down reloads; no manual refresh button.
  expect(screen.queryByRole('button', { name: /^(Retry|Refresh|Reload)\b/ })).toBeNull();
});
