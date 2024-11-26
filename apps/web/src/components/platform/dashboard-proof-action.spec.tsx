import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readInventoryAccess, branchPaymentProofQueue } from '@hsm/api-client';
import { DashboardProofAction } from './dashboard-proof-action';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  readInventoryAccess: vi.fn(),
  branchPaymentProofQueue: vi.fn(),
}));
vi.mock('../../lib/client', () => ({ browserClient: () => ({}) }));
const branchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
function mount(branches = [{ branchId, branchName: 'F-6' }]) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cache}>
      <DashboardProofAction actorId="actor" branches={branches} count={2} />
    </QueryClientProvider>,
  );
  return cache;
}
it('AUD-009 / PAY-004: a named branch action opens the actual submitted-proof queue', async () => {
  vi.mocked(readInventoryAccess).mockResolvedValue({
    branchId,
    canConfigureManagers: false,
    permissions: ['finance_view'],
  });
  vi.mocked(branchPaymentProofQueue).mockResolvedValue({ data: [], nextCursor: null });
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Payment proofs to verify: 2' }));
  fireEvent.click(await screen.findByRole('button', { name: 'F-6' }));
  expect(await screen.findByText('No proofs are waiting.')).toBeTruthy();
  expect(branchPaymentProofQueue).toHaveBeenCalledWith(expect.anything(), branchId, {
    state: 'submitted',
  });
});
it('AUD-009 / ACC-002: revoked authority removes the mounted queue and destination', async () => {
  vi.mocked(readInventoryAccess).mockResolvedValue({
    branchId,
    canConfigureManagers: false,
    permissions: ['finance_view'],
  });
  vi.mocked(branchPaymentProofQueue).mockResolvedValue({ data: [], nextCursor: null });
  const cache = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Payment proofs to verify: 2' }));
  fireEvent.click(await screen.findByRole('button', { name: 'F-6' }));
  await screen.findByText('No proofs are waiting.');
  vi.mocked(readInventoryAccess).mockResolvedValue({
    branchId,
    canConfigureManagers: false,
    permissions: [],
  });
  await cache.invalidateQueries({ queryKey: ['inventory-access'] });
  await waitFor(() => expect(screen.queryByLabelText('Payment proof review')).toBeNull());
  expect(screen.queryByRole('button', { name: 'F-6' })).toBeNull();
});
