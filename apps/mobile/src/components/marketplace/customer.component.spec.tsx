/// <reference types="jest" />
import { render, screen, userEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { CustomerMarketplace } from './customer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
let cache: QueryClient;
afterEach(() => cache.clear());
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../lib/runtime', () => ({ config: { apiUrl: 'https://example.test' } }));
jest.mock('./map', () => ({ MarketplaceMap: () => null }));
jest.mock('./details', () => ({ MarketplaceDetails: () => null }));
jest.mock('lucide-react-native', () => ({
  LocateFixed: () => null,
  Map: () => null,
  Briefcase: () => null,
  GraduationCap: () => null,
  HeartPulse: () => null,
  Hotel: () => null,
  Landmark: () => null,
  Library: () => null,
  School: () => null,
  ShoppingBag: () => null,
  UtensilsCrossed: () => null,
  Home: () => null,
  MapPin: () => null,
  Heart: () => null,
  CalendarDays: () => null,
  UserRound: () => null,
  Bell: () => null,
  House: () => null,
  ShieldCheck: () => null,
  BedDouble: () => null,
  UsersRound: () => null,
  Search: () => null,
  ArrowRight: () => null,
  ArrowLeft: () => null,
  SlidersHorizontal: () => null,
  Building2: () => null,
}));
jest.mock('../stay-directory', () => ({ StayDirectory: () => null }));
jest.mock('../customer-bookings', () => ({ CustomerBookings: () => null }));
jest.mock('./customer-account', () => ({
  CustomerAccount: () => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text>Customer account content</Text>;
  },
}));
jest.mock('../inbox', () => ({ Inbox: () => null }));
jest.mock('../use-inbox', () => ({
  useInbox: () => ({ query: { data: { pages: [{ unreadCount: 3 }] } } }),
}));
function emptySource() {
  return {
    data: { data: [], nextCursor: null },
    error: null as unknown,
    isPending: false,
    isError: false,
    isSuccess: true,
    hasNextPage: false,
    isFetchingNextPage: false,
    refetch: jest.fn(),
    fetchNextPage: jest.fn(),
  };
}
const mockSource = {
  listings: emptySource(),
  institutions: emptySource(),
  recent: emptySource(),
  saved: emptySource(),
  save: { isError: false, error: null, isPending: false, mutate: jest.fn() },
};
const mockMarketplace = jest.fn<typeof mockSource, [unknown]>(() => mockSource);
jest.mock('./use-marketplace', () => ({
  useMarketplace: (options: unknown) => mockMarketplace(options),
}));
beforeEach(() => {
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  jest.clearAllMocks();
  mockSource.listings = emptySource();
  mockSource.institutions = emptySource();
  mockSource.recent = emptySource();
  mockSource.saved = emptySource();
});

it('MKT-001 submits the visible search field without opening a separate panel', async () => {
  await render(view());
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Search hostels, university or area'), 'G-11');
  await user.press(screen.getByRole('button', { name: 'Search hostels' }));
  expect(mockMarketplace).toHaveBeenLastCalledWith(
    expect.objectContaining({ query: expect.objectContaining({ q: 'G-11', limit: 20 }) }),
  );
});
function view(actorId = 'customer-a') {
  return (
    <QueryClientProvider client={cache}>
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 360, height: 800 },
          insets: { top: 24, left: 0, right: 0, bottom: 24 },
        }}
      >
        <CustomerMarketplace actorId={actorId} name="Customer" />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
test('ACC-002: authenticated discovery uses real unread count and all five destinations', async () => {
  await render(view());
  expect(screen.getAllByRole('tab')).toHaveLength(5);
  expect(screen.getByRole('button', { name: 'Notifications, 3 unread' })).toBeVisible();
  await userEvent.setup().press(screen.getByRole('tab', { name: 'Saved' }));
  expect(screen.getByText('You have no saved hostels.')).toBeVisible();
  expect(router.push).not.toHaveBeenCalled();
});
test('SEC-003: failed Saved retrieval is an error with retry, never a false empty list', async () => {
  mockSource.saved.isError = true;
  mockSource.saved.error = new Error('Fixture failure');
  await render(view());
  await userEvent.setup().press(screen.getByRole('tab', { name: 'Saved' }));
  expect(screen.queryByText('You have no saved hostels.')).toBeNull();
  await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
  expect(mockSource.saved.refetch).toHaveBeenCalledTimes(1);
});
test('ACC-002: Saved and discovery expose actual next-page commands', async () => {
  mockSource.listings.hasNextPage = true;
  mockSource.saved.hasNextPage = true;
  await render(view());
  await userEvent.setup().press(screen.getByRole('button', { name: 'Load more hostels' }));
  expect(mockSource.listings.fetchNextPage).toHaveBeenCalledTimes(1);
  await userEvent.setup().press(screen.getByRole('tab', { name: 'Saved' }));
  await userEvent.setup().press(screen.getByRole('button', { name: 'Load more saved hostels' }));
  expect(mockSource.saved.fetchNextPage).toHaveBeenCalledTimes(1);
});
test('SEC-003: account switch resets the previous account Saved tab and private view state', async () => {
  const mounted = await render(view());
  await userEvent.setup().press(screen.getByRole('tab', { name: 'Saved' }));
  expect(screen.getByText('Saved hostels')).toBeVisible();
  await mounted.rerender(view('customer-b'));
  expect(screen.queryByText('Saved hostels')).toBeNull();
  expect(screen.getByText('Featured Hostels')).toBeVisible();
  await userEvent.setup().press(screen.getByRole('tab', { name: 'Account' }));
  expect(screen.getByText('Customer account content')).toBeVisible();
  expect(router.push).not.toHaveBeenCalled();
});
test('ACC-002: the header profile shortcut selects the same dedicated Account tab', async () => {
  await render(view());
  await userEvent.setup().press(screen.getByRole('button', { name: 'Profile' }));
  expect(screen.getByRole('tab', { name: 'Account', selected: true })).toBeVisible();
  expect(screen.getByText('Customer account content')).toBeVisible();
});
