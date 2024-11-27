/// <reference types="jest" />
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readCustomerStays } from '@hsm/api-client';
import type { SelfProfile, StaySummary } from '@hsm/contracts';
import { router } from 'expo-router';
import { CustomerAccount } from './customer-account';
import { rememberMode } from '../../lib/owner-mode';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useFocusEffect: jest.fn(),
}));
jest.mock('../../lib/runtime', () => ({ actorClient: jest.fn() }));
jest.mock('../../lib/owner-mode', () => ({ rememberMode: jest.fn() }));
jest.mock('../admin/invitation', () => ({ AdminInvitationEntry: () => null }));
jest.mock('../branches', () => ({ Branches: () => null }));
jest.mock('../email-association', () => ({ EmailAssociation: () => null }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  readCustomerStays: jest.fn(),
}));
const mockProfile: SelfProfile = {
  user: {
    id: 'customer',
    fullName: 'Customer',
    email: 'identity@example.test',
    emailVerified: true,
    cnicLast4: null,
  },
  capabilities: { customer: true, owner: false, managerOf: [], admin: null },
};
jest.mock('../providers', () => ({
  useSession: () => ({ profile: mockProfile, logout: jest.fn() }),
}));
jest.mock('../stay-directory', () => ({
  StayDirectory: ({ standalone }: { standalone: boolean }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text>{standalone ? 'Stay management open' : 'Stay management closed'}</Text>;
  },
}));
jest.mock('../customer-bookings', () => ({ CustomerBookings: () => null }));
jest.mock('../inbox', () => ({ Inbox: () => null }));
jest.mock('../visits', () => ({ Visits: () => null }));
jest.mock('../waitlist', () => ({ Waitlist: () => null }));
jest.mock('../chat', () => ({ Chat: () => null }));
jest.mock('../services/platform', () => ({ NativeHelpSupport: () => null }));
jest.mock('../own-profile-reviews', () => ({ NativeOwnProfileReviews: () => null }));

const readStays = jest.mocked(readCustomerStays);
let cache: QueryClient;
beforeEach(() => {
  jest.clearAllMocks();
  mockProfile.capabilities.owner = false;
  mockProfile.capabilities.admin = null;
  cache = new QueryClient();
  readStays.mockResolvedValue({ data: [], nextCursor: null });
});
afterEach(() => cache.clear());

function view() {
  return (
    <QueryClientProvider client={cache}>
      <CustomerAccount actorId="customer" unreadCount={3} saved={jest.fn()} back={jest.fn()} />
    </QueryClientProvider>
  );
}

test('ACC-002: Customer Account opens existing settings directly and uses a role-specific heading', async () => {
  await render(view());
  const user = userEvent.setup();
  expect(screen.getByRole('header', { name: 'Customer Account' })).toBeVisible();
  expect(screen.queryByText('Bookings')).toBeNull();
  expect(screen.queryByText('Unread alerts')).toBeNull();
  expect(screen.queryByText('Recent activity')).toBeNull();
  expect(screen.getByRole('button', { name: 'My bookings' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Notifications, 3 unread' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull();
  expect(screen.queryByText('Platform admin')).toBeNull();
  await user.press(screen.getByRole('button', { name: 'Profile' }));
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/customer-profile',
    params: { from: 'account' },
  });
  expect(screen.queryByRole('button', { name: 'All spaces' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Switch to Admin' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Switch to Owner' })).toBeNull();
  await user.press(screen.getByRole('button', { name: 'Set up Owner profile' }));
  expect(router.push).toHaveBeenCalledWith('/owner-profile');
  expect(screen.getByText('My stays')).toBeVisible();
});

test('ACC-002: grouped Account opens language and privacy information', async () => {
  await render(view());
  const user = userEvent.setup();
  for (const name of ['Account', 'Bookings & Stays', 'Communication', 'Support & Legal']) {
    expect(screen.getByRole('header', { name })).toBeVisible();
  }
  await user.press(screen.getByRole('button', { name: 'Languages' }));
  expect(screen.getByText('English · Current language')).toBeVisible();
  await user.press(screen.getByRole('button', { name: 'Back' }));
  await user.press(screen.getByRole('button', { name: 'Privacy Policy' }));
  expect(screen.getByRole('header', { name: 'Privacy Policy' })).toBeVisible();
  expect(screen.getByText(/Public hostel listings/)).toBeVisible();
});

test('ACC-002: assigned Admin and verified Owner can switch directly', async () => {
  mockProfile.capabilities.admin = { isRoot: false, roles: ['support'] };
  mockProfile.capabilities.owner = true;
  await render(view());
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'Switch to Admin' }));
  expect(rememberMode).toHaveBeenCalledWith('customer', 'admin');
  expect(router.replace).toHaveBeenCalledWith('/admin');
  await user.press(screen.getByRole('button', { name: 'Switch to Owner' }));
  expect(rememberMode).toHaveBeenCalledWith('customer', 'owner');
  expect(router.replace).toHaveBeenCalledWith('/owner');
  expect(screen.queryByRole('button', { name: 'Set up Owner profile' })).toBeNull();
});

test.each([
  ['check_in_ready', null, null, false],
  ['closed', '2026-11-01T10:00:00Z', '2026-11-02T10:00:00Z', false],
  ['active', null, null, false],
  ['active', '2026-11-01T10:00:00Z', null, true],
  ['notice_given', '2026-11-01T10:00:00Z', null, true],
  ['checkout_pending', '2026-11-01T10:00:00Z', null, true],
] as const)(
  'STAY-001: %s with check-in %s and closed at %s gives Resident access %s',
  async (state, checkedInAt, closedAt, eligible) => {
    readStays.mockResolvedValueOnce({
      data: [{ state, checkedInAt, closedAt } as StaySummary],
      nextCursor: null,
    });
    await render(view());
    await waitFor(() =>
      expect(
        cache.getQueryState(['private-stays', 'customer', 'own', 'account-current'])?.status,
      ).toBe('success'),
    );
    const label = eligible ? 'Resident services' : 'My stays';
    const row = await screen.findByText(label);
    expect(row).toBeVisible();
    await userEvent.setup().press(row);
    expect(screen.getByText('Stay management open')).toBeVisible();
  },
);
