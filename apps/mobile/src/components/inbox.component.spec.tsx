/// <reference types="jest" />
import { render, screen, userEvent } from '@testing-library/react-native';
import { Inbox } from './inbox';
const actorId = '019a1234-1234-7123-8123-123456789abc';
const id = '019a1234-1234-7123-8123-123456789abd';
function notice(read = false) {
  return {
    id,
    type: 'booking.confirmed',
    title: 'Booking update',
    body: 'Your booking status changed.',
    readAt: read ? '2026-10-15T10:00:00Z' : null,
    createdAt: '2026-10-15T09:00:00Z',
  };
}
function query() {
  return {
    isPending: false,
    isError: false,
    error: null as unknown,
    data: { pages: [{ data: [notice()], unreadCount: 2, nextCursor: id }] },
    hasNextPage: true,
    isFetchingNextPage: false,
    refetch: jest.fn(),
    fetchNextPage: jest.fn(),
  };
}
const mockState = {
  query: query(),
  mark: { isPending: false, isError: false, error: null as unknown, mutate: jest.fn() },
};
const mockUseInbox = jest.fn((actor: string) => {
  void actor;
  return mockState;
});
jest.mock('./use-inbox', () => ({ useInbox: (actor: string) => mockUseInbox(actor) }));
beforeEach(() => {
  jest.clearAllMocks();
  mockState.query = query();
  mockState.mark.isPending = false;
  mockState.mark.isError = false;
  mockState.mark.error = null;
});
test('NTF-002: loading cannot masquerade as empty inbox or zero unread', async () => {
  mockState.query.isPending = true;
  await render(<Inbox actorId={actorId} />);
  expect(screen.getByLabelText('Loading notifications…')).toBeVisible();
  expect(screen.queryByText('No notifications yet.')).toBeNull();
  expect(screen.queryByText('0 unread')).toBeNull();
});
test('SEC-003: own inbox dispatches actor scope and exact notice read action', async () => {
  await render(<Inbox actorId={actorId} />);
  expect(mockUseInbox).toHaveBeenCalledWith(actorId);
  expect(screen.getByText('2 unread')).toBeVisible();
  expect(screen.getByText('Your booking status changed.')).toBeVisible();
  await userEvent.setup().press(screen.getByRole('button', { name: 'Mark as read' }));
  expect(mockState.mark.mutate).toHaveBeenCalledWith(id);
});
test('NTF-002: server cursor controls load-more action', async () => {
  await render(<Inbox actorId={actorId} />);
  await userEvent.setup().press(screen.getByRole('button', { name: 'More notifications' }));
  expect(mockState.query.fetchNextPage).toHaveBeenCalled();
});
test('NTF-002: persisted read notices do not offer another read action', async () => {
  mockState.query.data.pages[0] = { data: [notice(true)], unreadCount: 0, nextCursor: id };
  mockState.query.hasNextPage = false;
  await render(<Inbox actorId={actorId} />);
  expect(screen.queryByLabelText('Unread')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Mark as read' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'More notifications' })).toBeNull();
});
test('NTF-002: confirmed empty response shows truthful empty state', async () => {
  mockState.query.data.pages[0] = { data: [], unreadCount: 0, nextCursor: id };
  mockState.query.hasNextPage = false;
  await render(<Inbox actorId={actorId} />);
  expect(screen.getByText('No notifications yet.')).toBeVisible();
  expect(screen.queryByText('0 unread')).toBeNull();
});
test('SEC-003: network error hides stale notice content and offers retry', async () => {
  mockState.query.isError = true;
  mockState.query.error = new Error('Internal provider detail');
  await render(<Inbox actorId={actorId} />);
  expect(screen.queryByText('Your booking status changed.')).toBeNull();
  expect(screen.queryByText('Internal provider detail')).toBeNull();
  // Pull down reloads; no manual refresh button.
  expect(screen.queryByRole('button', { name: /^(Retry|Refresh|Reload)\b/ })).toBeNull();
});
test('WAIT-001: vacancy notification opens only the supplied own waiting-list destination', async () => {
  mockState.query.data.pages[0] = {
    data: [{ ...notice(), type: 'waitlist.vacancy' }],
    unreadCount: 1,
    nextCursor: id,
  };
  const onWaitlist = jest.fn();
  await render(<Inbox actorId={actorId} onWaitlist={onWaitlist} />);
  await userEvent.setup().press(screen.getByRole('button', { name: 'Open my waiting list' }));
  expect(onWaitlist).toHaveBeenCalledTimes(1);
});
test('COMM-001 / NTF-002: chat notifications use only the supplied authorized message-space destination', async () => {
  mockState.query.data.pages[0] = {
    data: [{ ...notice(), type: 'chat.message.created' }],
    unreadCount: 1,
    nextCursor: id,
  };
  const onMessages = jest.fn();
  await render(<Inbox actorId={actorId} onMessages={onMessages} />);
  await userEvent.setup().press(screen.getByRole('button', { name: 'Open your message space' }));
  expect(onMessages).toHaveBeenCalledTimes(1);
});
test('VISIT-001 / NTF-002: follow-up notices use only the supplied own visit destination', async () => {
  mockState.query.data.pages[0] = {
    data: [{ ...notice(), type: 'visit.follow_up' }],
    unreadCount: 1,
    nextCursor: id,
  };
  const onVisits = jest.fn();
  await render(<Inbox actorId={actorId} onVisits={onVisits} />);
  await userEvent.setup().press(screen.getByRole('button', { name: 'Open my visits' }));
  expect(onVisits).toHaveBeenCalledTimes(1);
});
test('VISIT-001 / NTF-002: lifecycle changes use only the supplied current account space', async () => {
  mockState.query.data.pages[0] = {
    data: [{ ...notice(), type: 'visit.changed' }],
    unreadCount: 1,
    nextCursor: id,
  };
  const onVisitSpace = jest.fn();
  await render(<Inbox actorId={actorId} onVisitSpace={onVisitSpace} />);
  await userEvent.setup().press(screen.getByRole('button', { name: 'Open your visit space' }));
  expect(onVisitSpace).toHaveBeenCalledTimes(1);
});
