import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { listInventoryRoomTypes, readExpectedVacancy } from '@hsm/api-client';
import { VacancyEstimates } from './vacancy-estimates';
import {
  actorId,
  branchId,
  typeId,
  type as roomType,
} from '../../test/unit/inventory-pages.fixture';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  listInventoryRoomTypes: vi.fn(),
  readExpectedVacancy: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
const state = {
  branchId,
  roomTypeId: typeId,
  expectedVacancyDate: '2026-11-01',
  version: '2026-10-24T03:00:00.000Z',
};
function mount() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <VacancyEstimates actorId={actorId} branchId={branchId} />
    </QueryClientProvider>,
  );
  return { client, ...view };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listInventoryRoomTypes)
    .mockReset()
    .mockResolvedValue({
      branchId,
      permissions: ['listing_edit'],
      canConfigureManagers: false,
      data: [roomType],
      nextCursor: null,
    });
  vi.mocked(readExpectedVacancy).mockReset().mockResolvedValue(state);
});
afterEach(cleanup);
it('WAIT-001 / CHG-040: each room shows the bed-free date from a resident notice, read-only', async () => {
  mount();
  expect(await screen.findByText('Bed frees on 1 Nov 2026')).toBeTruthy();
  expect(screen.queryByText('Publish vacancy estimate')).toBeNull();
  expect(screen.queryByLabelText('Expected vacancy date')).toBeNull();
});
it('WAIT-001 / CHG-040: a room with no resident on notice says so', async () => {
  vi.mocked(readExpectedVacancy).mockResolvedValue({ ...state, expectedVacancyDate: null });
  mount();
  expect(await screen.findByText('No one on notice')).toBeTruthy();
});
