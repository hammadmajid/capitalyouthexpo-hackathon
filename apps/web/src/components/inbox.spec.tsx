import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClientFailure, listNotifications, markNotificationRead } from '@hsm/api-client';
import { Inbox } from './inbox';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
const actorId = '10000000-0000-4000-8000-000000000001',
  id = '10000000-0000-4000-8000-000000000002';
const notice = {
  id,
  type: 'waitlist.vacancy',
  title: 'Hostel availability changed',
  body: 'Check current availability. This alert does not reserve a bed.',
  createdAt: '2026-10-24T03:00:00.000Z',
  readAt: null,
};
const caches: QueryClient[] = [];
function mount() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  caches.push(client);
  const view = render(
    <QueryClientProvider client={client}>
      <Inbox actorId={actorId} />
    </QueryClientProvider>,
  );
  return { client, ...view };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listNotifications)
    .mockReset()
    .mockResolvedValue({ data: [notice], unreadCount: 1, nextCursor: null });
  vi.mocked(markNotificationRead).mockReset().mockResolvedValue({ id, readAt: notice.createdAt });
});
afterEach(() => {
  cleanup();
  for (const cache of caches.splice(0)) cache.clear();
});
it('NTF-002 / WAIT-001: web inbox loads lazily and navigates to the private Customer waiting list', async () => {
  mount();
  expect(listNotifications).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Notifications'));
  await screen.findByText(notice.body);
  expect(screen.getByRole('link', { name: 'Open my waiting list' }).getAttribute('href')).toBe(
    '/app/customer#waiting-list',
  );
  expect(screen.getByText('1 unread')).toBeTruthy();
  fireEvent.click(screen.getByText('Mark as read'));
  await waitFor(() =>
    expect(markNotificationRead).toHaveBeenCalledWith(expect.anything(), id, expect.any(String)),
  );
});
it('NTF-002: server pagination and persisted read state control available actions', async () => {
  vi.mocked(listNotifications)
    .mockResolvedValueOnce({ data: [notice], unreadCount: 1, nextCursor: id })
    .mockResolvedValueOnce({
      data: [{ ...notice, id: '10000000-0000-4000-8000-000000000003', readAt: notice.createdAt }],
      unreadCount: 1,
      nextCursor: null,
    });
  mount();
  fireEvent.click(screen.getByText('Notifications'));
  await screen.findByText(notice.body);
  fireEvent.click(screen.getByText('More notifications'));
  await screen.findByText('Read');
  expect(listNotifications).toHaveBeenLastCalledWith(expect.anything(), { cursor: id });
  expect(screen.queryByText('More notifications')).toBeNull();
});
it('SEC-003: failed revalidation hides cached notifications and exposes only safe retry', async () => {
  const { client } = mount();
  fireEvent.click(screen.getByText('Notifications'));
  await screen.findByText(notice.body);
  vi.mocked(listNotifications).mockRejectedValue(new ClientFailure('NETWORK_UNAVAILABLE'));
  await act(async () => {
    await client.refetchQueries({ queryKey: ['private-inbox', actorId] });
  });
  await screen.findByText('Retry notifications');
  expect(screen.queryByText(notice.body)).toBeNull();
  expect(screen.queryByText('1 unread')).toBeNull();
});
it('NTF-002: confirmed empty inbox is truthful', async () => {
  vi.mocked(listNotifications).mockResolvedValue({ data: [], unreadCount: 0, nextCursor: null });
  mount();
  fireEvent.click(screen.getByText('Notifications'));
  await screen.findByText('No notifications yet.');
  expect(screen.getByText('0 unread')).toBeTruthy();
});
it('COMM-001 / NTF-002: chat notices link only to the account message spaces', async () => {
  vi.mocked(listNotifications).mockResolvedValue({
    data: [{ ...notice, type: 'chat.message.created' }],
    unreadCount: 1,
    nextCursor: null,
  });
  mount();
  fireEvent.click(screen.getByText('Notifications'));
  const link = await screen.findByText('Open your message spaces');
  expect(link.getAttribute('href')).toBe('/app');
});
it('VISIT-001 / NTF-002: follow-up notices use the own Customer visit destination', async () => {
  vi.mocked(listNotifications).mockResolvedValue({
    data: [{ ...notice, type: 'visit.follow_up' }],
    unreadCount: 1,
    nextCursor: null,
  });
  mount();
  fireEvent.click(screen.getByText('Notifications'));
  const link = await screen.findByText('Open my visits');
  expect(link.getAttribute('href')).toBe('/app/customer#visits');
});
it('VISIT-001 / NTF-002: lifecycle notices return to current account spaces without arbitrary branch links', async () => {
  vi.mocked(listNotifications).mockResolvedValue({
    data: [{ ...notice, type: 'visit.changed' }],
    unreadCount: 1,
    nextCursor: null,
  });
  mount();
  fireEvent.click(screen.getByText('Notifications'));
  const link = await screen.findByText('Open your visit space');
  expect(link.getAttribute('href')).toBe('/app');
});
