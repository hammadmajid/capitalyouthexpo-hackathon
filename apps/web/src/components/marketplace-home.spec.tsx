import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { listMarketplace, marketplaceInstitutions } from '@hsm/api-client';
import { listingSummarySchema } from '@hsm/contracts';
import { MarketplaceHome } from './marketplace-home';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  listMarketplace: vi.fn(),
  marketplaceInstitutions: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
const branchId = randomUUID(),
  universityId = randomUUID();
const listing = listingSummarySchema.parse({
  branchId,
  brandName: 'Fixture brand',
  name: 'Fixture hostel',
  slug: 'fixture',
  category: 'boys',
  city: 'Islamabad',
  area: 'H-13',
  latitude: 33.6,
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
  vi.mocked(listMarketplace).mockResolvedValue({ data: [listing], nextCursor: null });
  vi.mocked(marketplaceInstitutions).mockResolvedValue({ data: [], nextCursor: null });
});
afterEach(() => {
  cleanup();
  caches.splice(0).forEach((cache) => cache.clear());
});
function show() {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  caches.push(cache);
  return render(
    <QueryClientProvider client={cache}>
      <MarketplaceHome />
    </QueryClientProvider>,
  );
}
it('ACC-002: public Home uses approved server results and exact prices', async () => {
  show();
  await screen.findByText('Fixture hostel');
  expect(screen.getByRole('link', { name: 'Fixture hostel' }).getAttribute('href')).toBe(
    `/hostels/${branchId}`,
  );
  expect(screen.getByText(/From PKR/).textContent).toContain('18,000.01');
  expect(listMarketplace).toHaveBeenCalledWith({}, { limit: 20 });
  expect(screen.getByText('Property photo unavailable')).toBeDefined();
});
it('ACC-002: discovery pagination retains previous actual listings', async () => {
  vi.mocked(listMarketplace)
    .mockResolvedValueOnce({ data: [listing], nextCursor: branchId })
    .mockResolvedValueOnce({
      data: [{ ...listing, branchId: randomUUID(), name: 'Second hostel' }],
      nextCursor: null,
    });
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'More hostels' }));
  await screen.findByRole('link', { name: 'Second hostel' });
  expect(screen.getByRole('link', { name: 'Fixture hostel' })).toBeDefined();
  expect(listMarketplace).toHaveBeenLastCalledWith({}, { limit: 20, cursor: branchId });
});
it('ACC-002: search sends validated filters and starts at the first page', async () => {
  show();
  await screen.findByRole('link', { name: 'Fixture hostel' });
  fireEvent.change(screen.getByLabelText('Hostel, university or area'), {
    target: { value: ' H-13 ' },
  });
  fireEvent.change(screen.getByLabelText('Minimum monthly rent (PKR)'), {
    target: { value: '18000.01' },
  });
  fireEvent.change(screen.getByLabelText('Hostel category'), { target: { value: 'boys' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  await waitFor(() =>
    expect(listMarketplace).toHaveBeenLastCalledWith(
      {},
      { q: 'H-13', category: 'boys', minimumRentPaisa: 1800001, availableOnly: false, limit: 20 },
    ),
  );
});
it('ACC-002: availability without dates cannot issue a discovery request', async () => {
  show();
  await screen.findByRole('link', { name: 'Fixture hostel' });
  fireEvent.click(screen.getByLabelText('Only available for these dates'));
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  await screen.findByRole('alert');
  expect(listMarketplace).toHaveBeenCalledTimes(1);
});
it('ACC-002: university selection remains scoped when applying category filters', async () => {
  vi.mocked(marketplaceInstitutions).mockResolvedValue({
    data: [
      {
        id: universityId,
        type: 'university',
        name: 'Fixture university',
        shortName: 'FAST',
        cityId: randomUUID(),
        latitude: 33.6,
        longitude: 73.1,
        hostelCount: 2,
      },
    ],
    nextCursor: null,
  });
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'FAST · 2 hostels' }));
  await waitFor(() =>
    expect(listMarketplace).toHaveBeenLastCalledWith(
      {},
      { universityPlaceId: universityId, radiusMeters: 5000, limit: 20 },
    ),
  );
  fireEvent.change(screen.getByLabelText('Hostel category'), { target: { value: 'boys' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  await waitFor(() =>
    expect(listMarketplace).toHaveBeenLastCalledWith(
      {},
      {
        q: '',
        category: 'boys',
        availableOnly: false,
        universityPlaceId: universityId,
        radiusMeters: 5000,
        limit: 20,
      },
    ),
  );
});
it('ACC-002: failed discovery never becomes a successful empty marketplace', async () => {
  vi.mocked(listMarketplace).mockRejectedValue(new Error('Offline'));
  show();
  await screen.findByRole('alert');
  expect(screen.queryByText('No approved hostels are available yet.')).toBeNull();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeDefined();
});
