import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createTransportRoute,
  readBranchRoutes,
  readBranchTransport,
  readInventoryAccess,
  readTransportOverview,
} from '@hsm/api-client';
import { BranchTransport } from './transport';
import { TransportRoutesSetup } from './transport-routes-setup';
vi.mock('../../lib/client', () => ({ browserClient: () => ({}) }));
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  createTransportRoute: vi.fn(),
  readBranchRoutes: vi.fn(),
  readBranchTransport: vi.fn(),
  readInventoryAccess: vi.fn(),
  readTransportOverview: vi.fn(),
}));
const branchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function access(permissions: string[]) {
  vi.mocked(readInventoryAccess).mockResolvedValue({
    branchId,
    permissions,
    canConfigureManagers: false,
  } as never);
}
function wrap(node: React.ReactNode) {
  render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readBranchRoutes).mockResolvedValue({ branchId, data: [] } as never);
  vi.mocked(readTransportOverview).mockResolvedValue({
    activeRoutes: 0,
    tripsToday: 0,
    activeSubscribers: 0,
    pendingRequests: 0,
  } as never);
  vi.mocked(readBranchTransport).mockResolvedValue({ data: [], nextCursor: null } as never);
});
afterEach(cleanup);
it('CHG-049: staff with listing and pricing grants add a new route with one idempotency key', async () => {
  access(['listing_edit', 'pricing_edit']);
  vi.mocked(createTransportRoute).mockResolvedValue({} as never);
  const user = userEvent.setup();
  wrap(<TransportRoutesSetup actorId="staff" branchId={branchId} />);
  await user.click(await screen.findByRole('button', { name: 'Add route' }));
  // CHG-049: a route cannot be published without a place it goes to.
  await user.click(screen.getByRole('button', { name: 'Publish route' }));
  expect(screen.getByRole('alert').textContent).toBe('Add a place first.');
  expect(createTransportRoute).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText('Search or type a place'), 'NUST H-12');
  await user.click(screen.getByRole('button', { name: 'Add this place' }));
  await user.click(screen.getByRole('button', { name: 'Publish route' }));
  await waitFor(() => expect(createTransportRoute).toHaveBeenCalledTimes(1));
  const [, sentBranch, body, key] = vi.mocked(createTransportRoute).mock.calls[0] ?? [];
  expect(sentBranch).toBe(branchId);
  // Unnamed routes take the first place's name.
  expect(body).toMatchObject({
    name: 'NUST H-12',
    status: 'active',
    destinations: [{ kind: 'other', name: 'NUST H-12', placeId: null, areaId: null }],
  });
  expect(typeof key).toBe('string');
  await waitFor(() => expect(screen.queryByLabelText('Route name (optional)')).toBeNull());
});
it('SEC-001: without both grants no route can be added', async () => {
  access(['listing_edit']);
  wrap(<TransportRoutesSetup actorId="staff" branchId={branchId} />);
  await waitFor(() => expect(readInventoryAccess).toHaveBeenCalled());
  await waitFor(() => expect(readBranchRoutes).toHaveBeenCalled());
  expect(screen.queryByRole('button', { name: 'Add route' })).toBeNull();
});
it('CHG-061: Operations filters requests by status and shows transport-only monthly fees', async () => {
  access(['stay_manage', 'rent_manage']);
  vi.mocked(readTransportOverview).mockResolvedValue({
    activeRoutes: 2,
    tripsToday: 4,
    activeSubscribers: 3,
    pendingRequests: 1,
    monthlyChargesPaisa: 930000,
  } as never);
  const user = userEvent.setup();
  wrap(<BranchTransport actorId="staff" branchId={branchId} />);
  expect(await screen.findByText(/3 transport subscribers · 1 requests · PKR 9,300/)).toBeTruthy();
  expect(screen.queryByText(/trips today/)).toBeNull();
  await user.selectOptions(await screen.findByLabelText('Transport request status'), 'requested');
  await waitFor(() =>
    expect(readBranchTransport).toHaveBeenLastCalledWith({}, branchId, { status: 'requested' }),
  );
});
