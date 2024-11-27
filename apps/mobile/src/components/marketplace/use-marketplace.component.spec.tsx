/// <reference types="jest" />
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import {
  listMarketplace,
  marketplaceInstitutions,
  listSavedHostels,
  saveHostel,
} from '@hsm/api-client';
import { listingSummarySchema } from '@hsm/contracts';
import { actorClient, client } from '../../lib/runtime';
import { useMarketplace } from './use-marketplace';
jest.mock('../../lib/runtime', () => ({ client: {}, actorClient: jest.fn() }));
jest.mock('expo-crypto', () => {
  let sequence = 0;
  return { randomUUID: () => '019a1234-1234-7123-8123-' + String(++sequence).padStart(12, '0') };
});
jest.mock('@hsm/api-client', () => ({
  listMarketplace: jest.fn(),
  marketplaceInstitutions: jest.fn(),
  listSavedHostels: jest.fn(),
  saveHostel: jest.fn(),
}));
const actorA = '019a1234-1234-7123-8123-123456789abc',
  actorB = '019a1234-1234-7123-8123-123456789abd';
type Page = Awaited<ReturnType<typeof listMarketplace>>;
let cache: QueryClient;
beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(actorClient).mockResolvedValue(client);
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  jest.mocked(listMarketplace).mockResolvedValue({ data: [], nextCursor: null });
  jest.mocked(listSavedHostels).mockResolvedValue({ data: [], nextCursor: null });
  jest.mocked(marketplaceInstitutions).mockResolvedValue({ data: [], nextCursor: null });
});
afterEach(() => cache.clear());
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={cache}>{children}</QueryClientProvider>;
}
function page(name: string, id: string, nextCursor: string | null = null): Page {
  return {
    data: [
      listingSummarySchema.parse({
        branchId: id,
        brandName: name,
        name,
        slug: id,
        category: 'boys',
        city: 'Islamabad',
        area: null,
        latitude: 33.68,
        longitude: 73.04,
        priceFromPaisa: null,
        verified: true,
        availableBeds: null,
        availableWholeRooms: null,
        amenities: [],
        media: [],
        distanceMeters: null,
      }),
    ],
    nextCursor,
  };
}
test('ACC-002: marketplace pagination uses the returned cursor and retains previous results', async () => {
  jest
    .mocked(listMarketplace)
    .mockResolvedValueOnce(page('First hostel', actorA, actorA))
    .mockResolvedValueOnce(page('Second hostel', actorB));
  const hook = await renderHook(
    () => useMarketplace({ actorId: null, customer: false, query: { limit: 20 }, recentIds: [] }),
    { wrapper },
  );
  await waitFor(() => expect(hook.result.current.listings.hasNextPage).toBe(true));
  await act(async () => {
    await hook.result.current.listings.fetchNextPage();
  });
  expect(listMarketplace).toHaveBeenNthCalledWith(2, {}, { limit: 20, cursor: actorA });
  await waitFor(() =>
    expect(hook.result.current.listings.data?.data.map((item) => item.name)).toEqual([
      'First hostel',
      'Second hostel',
    ]),
  );
  expect(hook.result.current.listings.hasNextPage).toBe(false);
  expect(listSavedHostels).not.toHaveBeenCalled();
});
test('SEC-003: late previous-account favorites cannot populate current Saved', async () => {
  let finish!: (value: Page) => void;
  const first = new Promise<Page>((resolve) => {
    finish = resolve;
  });
  jest
    .mocked(listSavedHostels)
    .mockImplementationOnce(() => first)
    .mockResolvedValueOnce(page('Current favorites', actorB));
  const hook = await renderHook(
    ({ actorId }: { actorId: string }) =>
      useMarketplace({ actorId, customer: true, query: {}, recentIds: [] }),
    { initialProps: { actorId: actorA }, wrapper },
  );
  await waitFor(() => expect(listSavedHostels).toHaveBeenCalledTimes(1));
  await hook.rerender({ actorId: actorB });
  await waitFor(() =>
    expect(hook.result.current.saved.data?.data[0]?.name).toBe('Current favorites'),
  );
  await act(async () => {
    finish(page('Previous private favorites', actorA));
    await first;
  });
  expect(hook.result.current.saved.data?.data[0]?.name).toBe('Current favorites');
});
test('ACC-002: Saved uses actual cursor pagination', async () => {
  jest
    .mocked(listSavedHostels)
    .mockResolvedValueOnce(page('First saved', actorA, actorA))
    .mockResolvedValueOnce(page('Second saved', actorB));
  const hook = await renderHook(
    () => useMarketplace({ actorId: actorA, customer: true, query: {}, recentIds: [] }),
    { wrapper },
  );
  await waitFor(() => expect(hook.result.current.saved.hasNextPage).toBe(true));
  await act(async () => {
    await hook.result.current.saved.fetchNextPage();
  });
  expect(listSavedHostels).toHaveBeenNthCalledWith(2, {}, { limit: 20, cursor: actorA });
  await waitFor(() => expect(hook.result.current.saved.data?.data).toHaveLength(2));
});
test('SEC-003: a failed favorite mutation retains its key until the server succeeds', async () => {
  jest
    .mocked(saveHostel)
    .mockRejectedValueOnce(new Error('Interrupted'))
    .mockResolvedValueOnce({ branchId: actorA, saved: true });
  const hook = await renderHook(
    () => useMarketplace({ actorId: actorA, customer: true, query: {}, recentIds: [] }),
    { wrapper },
  );
  await waitFor(() => expect(hook.result.current.saved.isSuccess).toBe(true));
  const input = { branchId: actorA, saved: true };
  await act(async () => {
    await expect(hook.result.current.save.mutateAsync(input)).rejects.toThrow('Interrupted');
  });
  await act(async () => {
    await hook.result.current.save.mutateAsync(input);
  });
  expect(saveHostel).toHaveBeenCalledTimes(2);
  expect(jest.mocked(saveHostel).mock.calls[0]?.[3]).toBe(
    jest.mocked(saveHostel).mock.calls[1]?.[3],
  );
  await waitFor(() => expect(listSavedHostels).toHaveBeenCalledTimes(2));
});

test('SEC-003: Saved never fetches under a replacement account token', async () => {
  jest.mocked(actorClient).mockRejectedValue(new Error('Account changed'));
  const hook = await renderHook(
    () => useMarketplace({ actorId: actorA, customer: true, query: {}, recentIds: [] }),
    { wrapper },
  );
  await waitFor(() => expect(hook.result.current.saved.isError).toBe(true));
  expect(listSavedHostels).not.toHaveBeenCalled();
});
