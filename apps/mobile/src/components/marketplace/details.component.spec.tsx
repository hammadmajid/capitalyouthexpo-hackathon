jest.mock('expo-router', () => ({
  useFocusEffect: (work: () => undefined | (() => void)) =>
    jest.requireActual<typeof import('react')>('react').useEffect(work, [work]),
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => false) },
}));
/// <reference types="jest" />
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { ApiFailure, marketplaceDetails } from '@hsm/api-client';
import { MarketplaceDetails } from './details';
import { setPublicInventory } from '../../../test/unit/public-inventory.fixture';
jest.mock('../../lib/runtime', () => ({ client: {}, config: { apiUrl: 'https://example.test' } }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual<typeof import('@hsm/api-client')>('@hsm/api-client'),
  marketplaceDetails: jest.fn(),
  listPublicInventoryRoomTypes: jest.fn(),
  listPublicInventoryRooms: jest.fn(),
  listPublicInventoryBeds: jest.fn(),
}));
jest.mock('./rules', () => ({ PublicListingRules: () => null }));
jest.mock('./gallery', () => ({
  PublicGallery: () => {
    const { Text: NativeText } = jest.requireActual<typeof import('react-native')>('react-native');
    return <NativeText>Gallery fixture</NativeText>;
  },
}));
jest.mock('./quote', () => ({
  MarketplaceQuote: () => {
    const { Text: NativeText } = jest.requireActual<typeof import('react-native')>('react-native');
    return <NativeText>Quote fixture</NativeText>;
  },
}));
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

let cache: QueryClient;
beforeEach(() => {
  jest.resetAllMocks();
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  jest.mocked(marketplaceDetails).mockResolvedValue(details);
  setPublicInventory();
});
afterEach(() => cache.clear());
async function show() {
  return render(
    <QueryClientProvider client={cache}>
      <MarketplaceDetails branchId={branchId} close={jest.fn()} signIn={jest.fn()} />
    </QueryClientProvider>,
  );
}
test('ROOM-002: native details display actual public room amenities and exact integer price', async () => {
  await show();
  expect(await screen.findByText('Actual branch')).toBeVisible();
  expect(await screen.findByText('Wi-Fi')).toBeVisible();
  expect(screen.getByText('Per bed: PKR 18,000.01 / month')).toBeVisible();
});
test.each([404, 403, 503])(
  'ACC-002: failed native refresh (%s) hides stale verified details and checkout controls',
  async (status) => {
    await show();
    await userEvent
      .setup()
      .press(await screen.findByRole('button', { name: 'Quote whole room 101' }));
    expect(screen.getByText('Quote fixture')).toBeVisible();
    jest.mocked(marketplaceDetails).mockRejectedValue(
      new ApiFailure({
        type: 'https://example.test/problem',
        title: 'Unavailable',
        status,
        code: status === 404 ? 'NOT_FOUND' : status === 403 ? 'FORBIDDEN' : 'INTERNAL',
        detail: 'Unavailable',
        traceId: 'fixture',
      }),
    );
    await act(() => cache.invalidateQueries({ queryKey: ['marketplace-details', branchId] }));
    await screen.findByRole('alert');
    await waitFor(() => expect(screen.queryByText('Actual branch')).toBeNull());
    expect(screen.queryByText('Verified property')).toBeNull();
    expect(screen.queryByText('Gallery fixture')).toBeNull();
    expect(screen.queryByText('Quote fixture')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Quote whole room 101' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  },
);

test('ACC-002: adjacent native gallery and rules have distinct reconciliation identities', async () => {
  const diagnostics = jest.spyOn(console, 'error');
  try {
    await show();
    await screen.findByText(details.name);
    expect(
      diagnostics.mock.calls.filter((args) =>
        args.some((value) => typeof value === 'string' && value.includes('same key')),
      ),
    ).toEqual([]);
  } finally {
    diagnostics.mockRestore();
  }
});
