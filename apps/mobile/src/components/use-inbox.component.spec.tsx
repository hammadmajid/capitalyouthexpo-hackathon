/// <reference types="jest" />
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { listNotifications } from '@hsm/api-client';
import { actorClient, client } from '../lib/runtime';
import { useInbox } from './use-inbox';
jest.mock('../lib/runtime', () => ({ client: {}, actorClient: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '019a1234-1234-7123-8123-123456789abc' }));
jest.mock('@hsm/api-client', () => ({
  listNotifications: jest.fn(),
  markNotificationRead: jest.fn(),
}));
const actorA = '019a1234-1234-7123-8123-123456789abc';
const actorB = '019a1234-1234-7123-8123-123456789abd';
type Page = Awaited<ReturnType<typeof listNotifications>>;
let cache: QueryClient;
beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(actorClient).mockResolvedValue(client);
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(() => cache.clear());
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={cache}>{children}</QueryClientProvider>;
}
function page(body: string, id: string): Page {
  return {
    data: [
      {
        id,
        type: 'account.email_verified',
        title: 'Account notice',
        body,
        createdAt: '2026-10-15T10:00:00Z',
        readAt: null,
      },
    ],
    nextCursor: null,
    unreadCount: 1,
  };
}
test('SEC-003 / NTF-002: a late previous-account request cannot populate the current inbox', async () => {
  let finishFirst: (value: Page) => void = () => {
    throw new Error('First request not started');
  };
  const first = new Promise<Page>((resolve) => {
    finishFirst = resolve;
  });
  jest
    .mocked(listNotifications)
    .mockImplementationOnce(() => first)
    .mockResolvedValueOnce(page('Current account notice', actorB));
  const hook = await renderHook(({ actorId }: { actorId: string }) => useInbox(actorId), {
    initialProps: { actorId: actorA },
    wrapper,
  });
  await waitFor(() => expect(listNotifications).toHaveBeenCalledTimes(1));
  await hook.rerender({ actorId: actorB });
  await waitFor(() =>
    expect(hook.result.current.query.data?.pages[0]?.data[0]?.body).toBe('Current account notice'),
  );
  await act(async () => {
    finishFirst(page('Previous account private notice', actorA));
    await first;
  });
  expect(hook.result.current.query.data?.pages[0]?.data[0]?.body).toBe('Current account notice');
  expect(hook.result.current.query.hasNextPage).toBe(false);
});

test('SEC-003: private inbox never fetches under a replacement account token', async () => {
  jest.mocked(actorClient).mockRejectedValue(new Error('Account changed'));
  jest.mocked(listNotifications).mockResolvedValue({ data: [], nextCursor: null, unreadCount: 0 });
  const hook = await renderHook(() => useInbox(actorA), { wrapper });
  await waitFor(() => expect(hook.result.current.query.isError).toBe(true));
  expect(listNotifications).not.toHaveBeenCalled();
});
