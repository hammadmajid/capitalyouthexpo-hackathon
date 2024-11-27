/// <reference types="jest" />
import { render, screen, userEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { GuestMarketplace } from './guest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const caches: QueryClient[] = [];
afterEach(() => {
  for (const cache of caches.splice(0)) cache.clear();
});
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
  SlidersHorizontal: () => null,
  Building2: () => null,
}));
function emptySource() {
  return {
    data: { data: [], nextCursor: null },
    error: null as unknown,
    isPending: false,
    refetch: jest.fn(),
  };
}
const mockSource = { listings: emptySource(), institutions: emptySource(), recent: emptySource() };
jest.mock('./use-marketplace', () => ({ useMarketplace: () => mockSource }));
beforeEach(() => {
  jest.clearAllMocks();
  mockSource.listings = emptySource();
  mockSource.institutions = emptySource();
  mockSource.recent = emptySource();
});
async function mount() {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  caches.push(cache);
  await render(
    <QueryClientProvider client={cache}>
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 360, height: 800 },
          insets: { top: 24, left: 0, right: 0, bottom: 24 },
        }}
      >
        <GuestMarketplace />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}
test('ACC-002: guest Home retains the five destinations and truthful empty results', async () => {
  await mount();
  expect(screen.getAllByRole('tab')).toHaveLength(5);
  expect(screen.getByText('No matching hostels.')).toBeVisible();
  expect(screen.queryByText('Recently viewed')).toBeNull();
  await userEvent.setup().press(screen.getByRole('tab', { name: 'Saved' }));
  expect(router.push).toHaveBeenCalledWith('/auth/login');
});
test('ACC-002: a network failure cannot masquerade as an empty marketplace', async () => {
  mockSource.listings.error = new Error('Fixture failure');
  await mount();
  expect(screen.queryByText('No approved hostels are available yet.')).toBeNull();
  await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
  expect(mockSource.listings.refetch).toHaveBeenCalledTimes(1);
  expect(mockSource.institutions.refetch).toHaveBeenCalledTimes(1);
});
test('ACC-002: loading does not invent inventory or unread notifications', async () => {
  mockSource.listings.isPending = true;
  await mount();
  expect(screen.getByLabelText('Loading hostels')).toBeVisible();
  expect(screen.queryByText('No approved hostels are available yet.')).toBeNull();
  expect(screen.getByRole('button', { name: 'Notifications' })).toBeVisible();
  expect(screen.queryByText('0')).toBeNull();
});
