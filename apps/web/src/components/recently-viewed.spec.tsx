import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { listMarketplace } from '@hsm/api-client';
import { listingSummarySchema } from '@hsm/contracts';
import { RecentlyViewed } from './recently-viewed';
import { recordRecentlyViewed } from './recently-viewed-history';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  listMarketplace: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
const first = randomUUID(),
  second = randomUUID();
const listing = (branchId: string, name: string) =>
  listingSummarySchema.parse({
    branchId,
    brandName: 'Actual brand',
    name,
    slug: 'actual-hostel',
    category: 'boys',
    city: 'Islamabad',
    area: 'H-13',
    latitude: 33.7,
    longitude: 73.1,
    priceFromPaisa: 1800001,
    verified: true,
    availableBeds: null,
    availableWholeRooms: null,
    amenities: [],
    media: [],
    distanceMeters: null,
  });
const caches: QueryClient[] = [];
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listMarketplace).mockResolvedValue({ data: [], nextCursor: null });
});
afterEach(() => {
  cleanup();
  caches.splice(0).forEach((cache) => cache.clear());
});
function show(ids: string[] = []) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  caches.push(cache);
  for (const id of [...ids].reverse()) recordRecentlyViewed(cache, id);
  render(
    <QueryClientProvider client={cache}>
      <RecentlyViewed />
    </QueryClientProvider>,
  );
  return cache;
}
it('ACC-002: empty history shows truthful guidance without broad marketplace requests or invented cards', () => {
  show();
  expect(screen.getByText('Hostels you open will appear here.')).toBeDefined();
  expect(screen.queryAllByRole('article')).toHaveLength(0);
  expect(listMarketplace).not.toHaveBeenCalled();
});
it('ACC-002: cards use current public summaries only, ordered by actual viewing history', async () => {
  vi.mocked(listMarketplace).mockResolvedValue({
    data: [
      listing(second, 'Older actual hostel'),
      listing(first, 'Most recent actual hostel'),
      listing(randomUUID(), 'Unrequested hostel'),
    ],
    nextCursor: null,
  });
  show([first, second]);
  await screen.findByRole('link', { name: 'Most recent actual hostel' });
  expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
    'Most recent actual hostel',
    'Older actual hostel',
  ]);
  expect(screen.queryByText('Unrequested hostel')).toBeNull();
  expect(screen.getAllByText('From PKR 18,000.01 / month')).toHaveLength(2);
  expect(listMarketplace).toHaveBeenCalledWith({}, { ids: [first, second], limit: 20 });
});
it('ACC-002: withdrawn records produce a genuine currently-unlisted state', async () => {
  show([first]);
  expect(await screen.findByText('No recently viewed hostels are currently listed.')).toBeDefined();
  expect(screen.queryAllByRole('article')).toHaveLength(0);
});
it('ACC-002: read failure is retryable and cannot be presented as empty success', async () => {
  vi.mocked(listMarketplace)
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValue({ data: [listing(first, 'Restored actual hostel')], nextCursor: null });
  show([first]);
  await screen.findByRole('alert');
  expect(screen.queryByText('No recently viewed hostels are currently listed.')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry recently viewed hostels' }));
  expect(await screen.findByRole('link', { name: 'Restored actual hostel' })).toBeDefined();
});
it('ACC-002: failed refresh hides cached cards instead of presenting stale publication as current', async () => {
  vi.mocked(listMarketplace)
    .mockResolvedValueOnce({ data: [listing(first, 'Actual hostel')], nextCursor: null })
    .mockRejectedValue(new Error('Withdrawn'));
  const cache = show([first]);
  await screen.findByRole('link', { name: 'Actual hostel' });
  await cache.invalidateQueries({ queryKey: ['marketplace-recent'] });
  await screen.findByRole('alert');
  expect(screen.queryByRole('link', { name: 'Actual hostel' })).toBeNull();
});
it('ACC-002: see-all reveals only actual loaded history and can collapse again', async () => {
  const ids = Array.from({ length: 5 }, () => randomUUID());
  vi.mocked(listMarketplace).mockResolvedValue({
    data: ids.map((id, index) => listing(id, 'Actual hostel ' + index)),
    nextCursor: null,
  });
  show(ids);
  fireEvent.click(await screen.findByRole('button', { name: 'See all recently viewed hostels' }));
  expect(screen.getAllByRole('article')).toHaveLength(5);
  fireEvent.click(screen.getByRole('button', { name: 'Show fewer recently viewed hostels' }));
  expect(screen.getAllByRole('article')).toHaveLength(4);
});
it('SEC-003: cache clear immediately removes displayed history and never queries all hostels', async () => {
  vi.mocked(listMarketplace).mockResolvedValue({
    data: [listing(first, 'Actual hostel')],
    nextCursor: null,
  });
  const cache = show([first]);
  await screen.findByRole('link', { name: 'Actual hostel' });
  act(() => cache.clear());
  await waitFor(() => expect(screen.getByText('Hostels you open will appear here.')).toBeDefined());
  expect(screen.queryAllByRole('article')).toHaveLength(0);
  expect(listMarketplace).toHaveBeenCalledTimes(1);
});
it('SEC-003: failed controlled listing photo shows fallback and never substitutes generated marketing art', async () => {
  vi.mocked(listMarketplace).mockResolvedValue({
    data: [
      { ...listing(first, 'Actual hostel'), media: [{ id: second, altText: 'Actual exterior' }] },
    ],
    nextCursor: null,
  });
  show([first]);
  fireEvent.error(await screen.findByRole('img', { name: 'Actual exterior' }));
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.getByText('Property photo unavailable')).toBeDefined();
});
