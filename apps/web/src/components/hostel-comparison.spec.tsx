import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClientFailure, listPublicInventoryRoomTypes, readHostelComparison } from '@hsm/api-client';
import { HostelComparison } from './hostel-comparison';
import { candidates, compared } from '../../test/unit/hostel-comparison.fixture';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  readHostelComparison: vi.fn(),
  listPublicInventoryRoomTypes: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
const caches: QueryClient[] = [];
beforeEach(() => {
  vi.mocked(readHostelComparison).mockReset().mockResolvedValue(compared);
  vi.mocked(listPublicInventoryRoomTypes)
    .mockReset()
    .mockImplementation(async (_client, branch) => ({
      branchId: branch,
      data: compared[0]?.roomTypes.data ?? [],
      nextCursor: null,
    }));
});
afterEach(() => {
  cleanup();
  for (const cache of caches.splice(0)) cache.clear();
});
function mount() {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } },
  });
  caches.push(cache);
  render(
    <QueryClientProvider client={cache}>
      <HostelComparison listings={candidates} institutions={[]} />
    </QueryClientProvider>,
  );
}
function select() {
  for (const candidate of candidates)
    fireEvent.click(screen.getByRole('button', { name: 'Compare ' + candidate.name }));
}
it('p.14 / ACC-002: selected public comparison renders real monthly prices, deposits and source links', async () => {
  mount();
  expect(screen.getByRole('button', { name: 'Load current comparison' })).toHaveProperty(
    'disabled',
    true,
  );
  select();
  fireEvent.click(screen.getByRole('button', { name: 'Load current comparison' }));
  await screen.findByRole('link', { name: 'View North hostel' });
  expect(readHostelComparison).toHaveBeenCalledWith(
    {},
    { ids: candidates.map((item) => item.branchId) },
  );
  await waitFor(() => expect(screen.getAllByText('Deposit: PKR 5,000')).toHaveLength(2));
  expect(screen.getAllByText('Available beds: Choose stay dates')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Load current comparison' }));
  await waitFor(() => expect(readHostelComparison).toHaveBeenCalledTimes(2));
});
it('p.14: changed dates invalidate old comparison and submit one common valid range', async () => {
  mount();
  select();
  fireEvent.change(screen.getByLabelText('Comparison move-in'), {
    target: { value: '2026-11-01' },
  });
  expect(screen.getByRole('button', { name: 'Load current comparison' })).toHaveProperty(
    'disabled',
    true,
  );
  fireEvent.change(screen.getByLabelText('Comparison move-out'), {
    target: { value: '2026-12-01' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Load current comparison' }));
  await screen.findByRole('link', { name: 'View North hostel' });
  expect(readHostelComparison).toHaveBeenCalledWith(
    {},
    {
      ids: candidates.map((item) => item.branchId),
      range: { moveInDate: '2026-11-01', moveOutDate: '2026-12-01' },
    },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Remove North hostel' }));
  expect(screen.queryByRole('link', { name: 'View North hostel' })).toBeNull();
});
it('SEC-003: a failed refresh hides the entire old comparison', async () => {
  mount();
  select();
  fireEvent.click(screen.getByRole('button', { name: 'Load current comparison' }));
  await screen.findByRole('link', { name: 'View North hostel' });
  vi.mocked(readHostelComparison).mockRejectedValueOnce(new ClientFailure('NETWORK_UNAVAILABLE'));
  fireEvent.click(screen.getByRole('button', { name: 'Load current comparison' }));
  await screen.findByRole('alert');
  expect(screen.queryByRole('link', { name: 'View North hostel' })).toBeNull();
});
it('SEC-003: a failed room-type source hides that listing column until retry succeeds', async () => {
  vi.mocked(listPublicInventoryRoomTypes).mockRejectedValue(
    new ClientFailure('NETWORK_UNAVAILABLE'),
  );
  mount();
  select();
  fireEvent.click(screen.getByRole('button', { name: 'Load current comparison' }));
  await screen.findAllByRole('alert');
  expect(screen.queryByRole('link', { name: 'View North hostel' })).toBeNull();
  expect(screen.queryByText('Monthly rent from: PKR 18,000.01')).toBeNull();
});
it('p.14: at most four distinct hostels can be selected', () => {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  caches.push(cache);
  const listings = Array.from({ length: 5 }, (_, index) => ({
    branchId: '10000000-0000-4000-8000-' + String(index + 1).padStart(12, '0'),
    name: 'Hostel ' + index,
  }));
  render(
    <QueryClientProvider client={cache}>
      <HostelComparison listings={listings} institutions={[]} />
    </QueryClientProvider>,
  );
  for (const listing of listings.slice(0, 4))
    fireEvent.click(screen.getByRole('button', { name: 'Compare ' + listing.name }));
  expect(screen.getByRole('button', { name: 'Compare Hostel 4' })).toHaveProperty('disabled', true);
});
it('p.14: each comparison column pages room types through exact branch/date scope', async () => {
  const first = compared[0]?.roomTypes.data[0];
  if (!first) throw new Error('Missing type cursor');
  const next = first.id;
  vi.mocked(listPublicInventoryRoomTypes).mockImplementation(async (_client, branchId, query) => ({
    branchId,
    data: [
      {
        ...first,
        name:
          query && typeof query === 'object' && 'cursor' in query ? 'Later room type' : 'Twin beds',
      },
    ],
    nextCursor: query && typeof query === 'object' && 'cursor' in query ? null : next,
  }));
  mount();
  select();
  fireEvent.click(screen.getByRole('button', { name: 'Load current comparison' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Next room types for North hostel' }));
  await screen.findByText('Later room type · Capacity 2');
  expect(listPublicInventoryRoomTypes).toHaveBeenCalledWith({}, candidates[0]?.branchId, {
    limit: 20,
    cursor: next,
  });
  fireEvent.click(screen.getByRole('button', { name: 'First room types for North hostel' }));
  await waitFor(() => expect(screen.queryByText('Later room type · Capacity 2')).toBeNull());
});
