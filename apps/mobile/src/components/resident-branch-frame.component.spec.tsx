import { render, screen, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readApi } from '@hsm/api-client';
import { Branches } from './branches';
jest.mock('./services/staff', () => ({ NativeBranchServices: () => null }));
jest.mock('./transport/transport-workspace', () => ({ TransportWorkspace: () => null }));
jest.mock('./visits', () => ({ Visits: () => null }));
jest.mock('./waitlist', () => ({ Waitlist: () => null }));
jest.mock('./chat', () => ({ Chat: () => null }));
jest.mock('./native-billing-policy', () => ({ NativeBillingPolicy: () => null }));
jest.mock('./branch-residents', () => ({ BranchResidents: () => null }));
jest.mock('./native-billing-catalog', () => ({ NativeBillingCatalog: () => null }));
jest.mock('./staff/staff-workspace', () => ({ StaffWorkspace: () => null }));
jest.mock('./native-inventory', () => ({ NativeInventory: () => null }));
jest.mock('./use-hostel-bookings', () => ({ nativeScopeDenied: () => false }));
jest.mock('../lib/runtime', () => ({ actorClient: async () => ({ GET: async () => ({}) }) }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  readApi: jest.fn(),
}));
jest.mock('./hostel-bookings', () => ({
  HostelBookings: () => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text>Selected branch workspace</Text>;
  },
}));
it('BR-01 / RES-004: selected branch content replaces the branch picker and can return to it', async () => {
  jest
    .mocked(readApi)
    .mockResolvedValue({ data: [{ id: 'branch', name: 'Main branch' }], nextCursor: null });
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={cache}>
      <Branches context="owner" actorId="actor" />
    </QueryClientProvider>,
  );
  await fireEvent.press(await screen.findByRole('button', { name: 'Main branch' }));
  expect(await screen.findByText('Selected branch workspace')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Main branch' })).toBeNull();
  expect(screen.queryByText('Selected: Main branch')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Back to branches' }));
  expect(await screen.findByRole('button', { name: 'Main branch' })).toBeTruthy();
});
