import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiFailure, marketplaceDetails } from '@hsm/api-client';
import { MarketplaceDetails } from './marketplace-details';
import { setPublicInventory } from '../../test/unit/public-inventory.fixture';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  marketplaceDetails: vi.fn(),
  listPublicInventoryRoomTypes: vi.fn(),
  listPublicInventoryRooms: vi.fn(),
  listPublicInventoryBeds: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
vi.mock('./public-listing-rules', () => ({ PublicListingRules: () => <p>Rules fixture</p> }));
vi.mock('./public-gallery', () => ({ PublicGallery: () => <p>Gallery fixture</p> }));
vi.mock('./save-hostel-action', () => ({ SaveHostelAction: () => null }));
vi.mock('./marketplace-quote', () => ({ MarketplaceQuote: () => <p>Quote fixture</p> }));
const branchId = '019a1234-1234-7123-8123-123456789abc';
const details: Awaited<ReturnType<typeof marketplaceDetails>> = {
  branchId,
  brandName: 'Actual hostel',
  name: 'Actual branch',
  slug: 'actual-branch',
  category: 'boys',
  city: 'Islamabad',
  area: null,
  latitude: 33.7,
  longitude: 73.1,
  priceFromPaisa: 1800001,
  verified: true,
  availableBeds: null,
  availableWholeRooms: null,
  amenities: [],
  media: [],
  distanceMeters: null,
  description: 'Actual description',
  address: 'Actual address',
  landmark: null,
  publicPhone: null,
  publicEmail: null,
};

const caches: QueryClient[] = [];
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(marketplaceDetails).mockResolvedValue(details);
  setPublicInventory();
});
afterEach(() => {
  cleanup();
  caches.splice(0).forEach((cache) => cache.clear());
});
function show() {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  caches.push(cache);
  render(
    <QueryClientProvider client={cache}>
      <MarketplaceDetails branchId={branchId} />
    </QueryClientProvider>,
  );
  return cache;
}
it('ROOM-002: details display only actual public room amenity names and exact integer price', async () => {
  const cache = show();
  await screen.findByRole('heading', { name: 'Actual branch' });
  await waitFor(() => expect(cache.getQueryData(['marketplace-recent-ids'])).toEqual([branchId]));
  expect(await screen.findByText('Wi-Fi')).toBeDefined();
  expect(screen.getByText('Per bed: PKR 18,000.01 / month')).toBeDefined();
});
it.each([404, 403, 503])(
  'ACC-002: failed refresh (%s) hides stale verified details, photos and quote controls',
  async (status) => {
    const cache = show();
    fireEvent.click(await screen.findByRole('button', { name: 'Quote whole room 101' }));
    expect(screen.getByText('Quote fixture')).toBeDefined();
    vi.mocked(marketplaceDetails).mockRejectedValue(
      new ApiFailure({
        type: 'https://example.test/problem',
        title: 'Unavailable',
        status,
        code: status === 404 ? 'NOT_FOUND' : status === 403 ? 'FORBIDDEN' : 'INTERNAL',
        detail: 'Unavailable',
        traceId: 'fixture',
      }),
    );
    await cache.invalidateQueries({ queryKey: ['marketplace-details', branchId] });
    await screen.findByRole('alert');
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Actual branch' })).toBeNull(),
    );
    expect(screen.queryByText('Verified property')).toBeNull();
    expect(screen.queryByText('Gallery fixture')).toBeNull();
    expect(screen.queryByText('Quote fixture')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Quote whole room 101' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDefined();
  },
);

it('ACC-002: an unsuccessful public-detail request does not fabricate viewing history', async () => {
  vi.mocked(marketplaceDetails).mockRejectedValue(new Error('Unavailable'));
  const cache = show();
  await screen.findByRole('alert');
  expect(cache.getQueryData(['marketplace-recent-ids'])).toBeUndefined();
});

it('ACC-002: adjacent gallery and rules have distinct reconciliation identities', async () => {
  const diagnostics = vi.spyOn(console, 'error');
  try {
    show();
    await screen.findByRole('heading', { name: details.name });
    expect(
      diagnostics.mock.calls.filter((args) =>
        args.some((value) => typeof value === 'string' && value.includes('same key')),
      ),
    ).toEqual([]);
  } finally {
    diagnostics.mockRestore();
  }
});
