import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClientFailure, readHostelComparison, listPublicInventoryRoomTypes } from '@hsm/api-client';
import { HostelComparison } from './comparison';
import { candidates, compared } from '../../../test/unit/hostel-comparison.fixture';
import { pickDate } from '../../test-utils/pick-date';
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  readHostelComparison: jest.fn(),
  listPublicInventoryRoomTypes: jest.fn(),
}));
jest.mock('../../lib/runtime', () => ({ client: {}, config: { apiUrl: 'https://example.test' } }));
const caches: QueryClient[] = [];
beforeEach(() => {
  jest.mocked(readHostelComparison).mockReset().mockResolvedValue(compared);
  jest
    .mocked(listPublicInventoryRoomTypes)
    .mockReset()
    .mockImplementation(async (_client, branchId) => ({
      branchId,
      data: compared[0]?.roomTypes.data ?? [],
      nextCursor: null,
    }));
});
afterEach(async () => {
  await cleanup();
  for (const cache of caches.splice(0)) cache.clear();
});
async function mount() {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } },
  });
  caches.push(cache);
  const open = jest.fn();
  await render(
    <QueryClientProvider client={cache}>
      <HostelComparison listings={candidates} institutions={[]} openListing={open} />
    </QueryClientProvider>,
  );
  return open;
}
async function select() {
  for (const candidate of candidates)
    await fireEvent.press(screen.getByRole('button', { name: 'Compare ' + candidate.name }));
}
it('p.14 / ACC-002: native comparison loads real prices/deposits and opens the exact listing', async () => {
  const open = await mount();
  expect(screen.getByRole('button', { name: 'Load current comparison' })).toBeDisabled();
  await select();
  await fireEvent.press(screen.getByRole('button', { name: 'Load current comparison' }));
  await screen.findByRole('button', { name: 'View North hostel' });
  expect(readHostelComparison).toHaveBeenCalledWith(
    {},
    { ids: candidates.map((item) => item.branchId) },
  );
  await waitFor(() => expect(screen.getAllByText('Deposit: PKR 5,000')).toHaveLength(2));
  await fireEvent.press(screen.getByRole('button', { name: 'View North hostel' }));
  expect(open).toHaveBeenCalledWith(candidates[0]?.branchId);
  await fireEvent.press(screen.getByRole('button', { name: 'Load current comparison' }));
  await waitFor(() => expect(readHostelComparison).toHaveBeenCalledTimes(2));
});
it('p.14: native dates must be complete and shared across selected hostels', async () => {
  await mount();
  await select();
  await pickDate('Move-in', '2026-11-01');
  expect(screen.getByRole('button', { name: 'Load current comparison' })).toBeDisabled();
  await pickDate('Move-out', '2026-12-01');
  await fireEvent.press(screen.getByRole('button', { name: 'Load current comparison' }));
  await screen.findByRole('button', { name: 'View North hostel' });
  expect(readHostelComparison).toHaveBeenCalledWith(
    {},
    {
      ids: candidates.map((item) => item.branchId),
      range: { moveInDate: '2026-11-01', moveOutDate: '2026-12-01' },
    },
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Remove North hostel' }));
  expect(screen.queryByRole('button', { name: 'View North hostel' })).toBeNull();
});
it('SEC-003: failed native comparison refresh suppresses every cached result', async () => {
  await mount();
  await select();
  await fireEvent.press(screen.getByRole('button', { name: 'Load current comparison' }));
  await screen.findByRole('button', { name: 'View North hostel' });
  jest.mocked(readHostelComparison).mockRejectedValueOnce(new ClientFailure('NETWORK_UNAVAILABLE'));
  await fireEvent.press(screen.getByRole('button', { name: 'Load current comparison' }));
  await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: 'View North hostel' })).toBeNull();
});
it('p.14: native independently pages exact comparison room types', async () => {
  const first = compared[0]?.roomTypes.data[0];
  if (!first) throw new Error('Missing room type');
  jest
    .mocked(listPublicInventoryRoomTypes)
    .mockImplementation(async (_client, branchId, query) => ({
      branchId,
      data: [
        {
          ...first,
          name:
            query && typeof query === 'object' && 'cursor' in query
              ? 'Later room type'
              : 'Twin beds',
        },
      ],
      nextCursor: query && typeof query === 'object' && 'cursor' in query ? null : first.id,
    }));
  await mount();
  await select();
  await fireEvent.press(screen.getByRole('button', { name: 'Load current comparison' }));
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Next room types for North hostel' }),
  );
  await screen.findByText('Later room type · Capacity 2');
  expect(listPublicInventoryRoomTypes).toHaveBeenCalledWith({}, candidates[0]?.branchId, {
    limit: 20,
    cursor: first.id,
  });
  await fireEvent.press(screen.getByRole('button', { name: 'First room types for North hostel' }));
  await waitFor(() => expect(screen.queryByText('Later room type · Capacity 2')).toBeNull());
});
