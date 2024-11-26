/// <reference types="jest" />
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import { readBranchDashboard, readInventoryAccess } from '@hsm/api-client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ManagerHome } from './manager-home';
const branchId = '550e8400-e29b-41d4-a716-446655440000';
const mockProfile = {
  user: { id: '550e8400-e29b-41d4-a716-446655440009', fullName: 'Ali Manager' },
  capabilities: {
    customer: false,
    owner: false,
    managerOf: [{ branchId: '550e8400-e29b-41d4-a716-446655440000', branchName: 'Main branch' }],
    admin: null,
  },
};
jest.mock('./providers', () => ({ useSession: () => ({ profile: mockProfile }) }));
jest.mock('./visual-surfaces', () => ({ NatureBackground: () => null }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../lib/runtime', () => ({ actorClient: jest.fn(async () => ({})) }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  readBranchDashboard: jest.fn(),
  readInventoryAccess: jest.fn(),
}));
const dashboard = {
  branchId,
  asOf: '2026-11-14',
  today: { moveIns: 1, checkouts: 0, visits: 2 },
  queue: {
    pendingBookings: 3,
    pendingProofs: 0,
    openComplaints: 1,
    upcomingCheckouts: 0,
    overdueInvoices: 2,
  },
  beds: { beds: 10, occupied: 6, available: 3, reserved: 1, blocked: 0, unavailable: 0 },
  unreadNotices: 0,
  rent: null,
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(readBranchDashboard).mockResolvedValue(dashboard as never);
  jest.mocked(readInventoryAccess).mockResolvedValue({
    branchId,
    permissions: ['stay_manage'],
    canConfigureManagers: false,
  } as never);
});
async function mount() {
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ManagerHome />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}
test('MGRD-001: the assigned branch shows real queue counts and opens the matching tool', async () => {
  await mount();
  expect(screen.getByText('Main branch')).toBeTruthy();
  const bookings = await screen.findByRole('button', { name: 'Bookings: 3' });
  expect(screen.getByText('6 pending')).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Payment proofs: 0' }).props.accessibilityState,
  ).toEqual({ disabled: true });
  await fireEvent.press(bookings);
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/manager-branch',
    params: { branchId, tool: 'bookings' },
  });
});
test('MGRD-003: rent money appears only when the server includes it', async () => {
  await mount();
  await screen.findByRole('button', { name: 'Bookings: 3' });
  expect(screen.queryByText('Rent this month')).toBeNull();
});
test('SEC-001: tools a Manager provably cannot use are not offered', async () => {
  await mount();
  await screen.findByRole('button', { name: 'Residents' });
  // stay_manage only: no booking_manage, so the Bookings tool tile is hidden.
  expect(screen.queryByRole('button', { name: 'Bookings' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Complaints & Services' })).toBeTruthy();
});
test('MGRD-003: with finance access the server rent figures are shown exactly', async () => {
  jest.mocked(readBranchDashboard).mockResolvedValue({
    ...dashboard,
    rent: {
      month: '2026-11',
      invoices: 1,
      expectedPaisa: 1800000,
      collectedPaisa: 0,
      outstandingPaisa: 1800000,
      overdueInvoices: 1,
    },
  } as never);
  await mount();
  expect(await screen.findByText('Rent this month')).toBeTruthy();
  expect(screen.getAllByText('PKR 18,000').length).toBeGreaterThan(0);
});
