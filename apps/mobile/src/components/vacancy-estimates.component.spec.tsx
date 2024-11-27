import { cleanup, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { listInventoryRoomTypes, readExpectedVacancy } from '@hsm/api-client';
import { VacancyEstimates } from './vacancy-estimates';
import { actorId, branchId, typeId, inventory } from '../../test/unit/inventory-pages.fixture';
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  listInventoryRoomTypes: jest.fn(),
  readExpectedVacancy: jest.fn(),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => '10000000-0000-4000-8000-000000000004' }));
jest.mock('../lib/runtime', () => ({ actorClient: async () => ({}) }));
const state = {
  branchId,
  roomTypeId: typeId,
  expectedVacancyDate: '2026-11-01',
  version: '2026-10-24T03:00:00.000Z',
};
const caches: QueryClient[] = [];
async function mount() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  caches.push(client);
  await render(
    <QueryClientProvider client={client}>
      <VacancyEstimates actorId={actorId} branchId={branchId} />
    </QueryClientProvider>,
  );
  return client;
}
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(listInventoryRoomTypes)
    .mockReset()
    .mockResolvedValue({
      branchId,
      permissions: ['listing_edit'],
      canConfigureManagers: false,
      data: inventory.roomTypes,
      nextCursor: null,
    });
  jest.mocked(readExpectedVacancy).mockReset().mockResolvedValue(state);
});
afterEach(async () => {
  await cleanup();
  for (const client of caches.splice(0)) client.clear();
});
it('WAIT-001 / CHG-040: each room shows the bed-free date from a resident notice, read-only', async () => {
  await mount();
  expect(await screen.findByText('Bed frees on 1 Nov 2026')).toBeTruthy();
  expect(screen.queryByText('Publish vacancy estimate')).toBeNull();
  expect(screen.queryByRole('button', { name: /Expected vacancy date/ })).toBeNull();
});
it('WAIT-001 / CHG-040: a room with no resident on notice says so', async () => {
  jest.mocked(readExpectedVacancy).mockResolvedValue({ ...state, expectedVacancyDate: null });
  await mount();
  expect(await screen.findByText('No one on notice')).toBeTruthy();
});
