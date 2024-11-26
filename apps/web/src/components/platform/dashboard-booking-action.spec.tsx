import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readInventoryAccess, listHostelBookings } from '@hsm/api-client';
import { DashboardBookingAction } from './dashboard-booking-action';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  readInventoryAccess: vi.fn(),
  listHostelBookings: vi.fn(),
}));
vi.mock('../../lib/client', () => ({ browserClient: () => ({}) }));
const branchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
function mount(branches = [{ branchId, branchName: 'F-6' }]) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cache}>
      <DashboardBookingAction actorId="actor" branches={branches} count={2} />
    </QueryClientProvider>,
  );
  return cache;
}
it('AUD-009 / BKG-004: a named branch action opens the actual pending-request queue', async () => {
  vi.mocked(readInventoryAccess).mockResolvedValue({
    branchId,
    canConfigureManagers: false,
    permissions: ['booking_manage'],
  });
  vi.mocked(listHostelBookings).mockResolvedValue({ data: [], nextCursor: null });
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Booking requests to decide: 2' }));
  fireEvent.click(await screen.findByRole('button', { name: 'F-6' }));
  expect(await screen.findByText('No bookings are available for this branch.')).toBeTruthy();
  expect(listHostelBookings).toHaveBeenCalledWith(expect.anything(), branchId, {
    limit: 20,
    queue: 'pending_requests',
  });
});
it('AUD-009 / ACC-002: revoked authority removes the mounted queue and destination', async () => {
  vi.mocked(readInventoryAccess).mockResolvedValue({
    branchId,
    canConfigureManagers: false,
    permissions: ['booking_manage'],
  });
  vi.mocked(listHostelBookings).mockResolvedValue({ data: [], nextCursor: null });
  const cache = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Booking requests to decide: 2' }));
  fireEvent.click(await screen.findByRole('button', { name: 'F-6' }));
  await screen.findByText('No bookings are available for this branch.');
  vi.mocked(readInventoryAccess).mockResolvedValue({
    branchId,
    canConfigureManagers: false,
    permissions: [],
  });
  await cache.invalidateQueries({ queryKey: ['inventory-access'] });
  await waitFor(() => expect(screen.queryByLabelText('Branch bookings')).toBeNull());
  expect(screen.queryByRole('button', { name: 'F-6' })).toBeNull();
});
