import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readApi, readDashboardQueue, readInventoryAccess } from '@hsm/api-client';
import { DashboardQueueBranches } from './dashboard-queue-branches';
import { DashboardQueueScope } from './dashboard-queue-scope';
import { DashboardQueueLink } from './dashboard-queue-link';
import { dashboardQueuePath } from '../../lib/dashboard-queue-path';
import type { ReactNode } from 'react';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  readApi: vi.fn(),
  readDashboardQueue: vi.fn(),
  readInventoryAccess: vi.fn(),
}));
vi.mock('../../lib/client', () => ({ browserClient: () => ({ GET: vi.fn() }) }));
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const branchId = id(1),
  actorId = id(999);
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readInventoryAccess).mockResolvedValue({
    branchId,
    permissions: ['stay_manage', 'finance_view', 'booking_manage'],
    canConfigureManagers: false,
  });
});
afterEach(cleanup);
function show(node: ReactNode) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(<QueryClientProvider client={cache}>{node}</QueryClientProvider>);
  return cache;
}
it('AUD-009 / OWN-003: named Owner queue pages can reach the 101st authorized branch', async () => {
  let page = 0;
  vi.mocked(readApi).mockImplementation(async () => {
    const offset = (page++ % 6) * 20;
    return {
      data: Array.from({ length: offset === 100 ? 2 : 20 }, (_, index) => ({
        id: id(offset + index + 1),
        organizationId: id(500),
        brandId: id(501),
        name: 'Branch ' + (offset + index + 1),
        verificationStatus: 'approved',
      })),
      nextCursor: offset === 100 ? null : id(offset + 20),
    };
  });
  show(<DashboardQueueBranches actorId={actorId} context="owner" queue="overdue" />);
  for (let index = 0; index < 5; index++) {
    await screen.findByRole('link', { name: 'Branch ' + (index * 20 + 1) });
    fireEvent.click(await screen.findByRole('button', { name: 'Next queue branches' }));
  }
  const link = await screen.findByRole('link', { name: 'Branch 101' });
  expect(link.getAttribute('href')).toBe(dashboardQueuePath('owner', 'overdue', id(101)));
  expect(screen.queryByRole('button', { name: 'Next queue branches' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'First queue branches' }));
  await waitFor(() => expect(readApi).toHaveBeenCalledTimes(7));
  await screen.findByRole('link', { name: 'Branch 1' });
});
it.each(['overdue', 'complaints', 'checkouts'] as const)(
  'AUD-009: the actual %s queue handles empty results and hides cached data after grant revocation',
  async (queue) => {
    vi.mocked(readDashboardQueue).mockResolvedValue({
      queue,
      branchId,
      asOf: '2026-10-28',
      data: [],
      nextCursor: null,
    });
    const cache = show(<DashboardQueueScope actorId={actorId} branchId={branchId} queue={queue} />);
    await screen.findByText('No items are waiting in this queue.');
    expect(readDashboardQueue).toHaveBeenCalledWith(expect.anything(), branchId, queue, {
      limit: 20,
    });
    vi.mocked(readInventoryAccess).mockResolvedValue({
      branchId,
      permissions: [],
      canConfigureManagers: false,
    });
    await cache.invalidateQueries({ queryKey: ['inventory-access', actorId, branchId] });
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Operational queue' })).toBeNull(),
    );
  },
);
it('AUD-009 / FIN-001: overdue detail uses the server canonical balance and keeps invoice pagination explicit', async () => {
  const balance = {
    invoiceId: id(10),
    invoiceNumber: 'INV-QUEUE',
    currency: 'PKR' as const,
    dueDate: '2026-10-01',
    graceDays: 2,
    totalPaisa: 10001,
    debitAdjustmentsPaisa: 0,
    creditAdjustmentsPaisa: 0,
    allocatedPaisa: 1,
    outstandingPaisa: 10000,
    state: 'overdue' as const,
  };
  vi.mocked(readDashboardQueue).mockResolvedValue({
    queue: 'overdue',
    branchId,
    asOf: '2026-10-28',
    data: [{ stayId: id(20), displayName: 'Queue resident', balance }],
    nextCursor: id(10),
  });
  show(<DashboardQueueScope actorId={actorId} branchId={branchId} queue="overdue" />);
  fireEvent.click(await screen.findByRole('button', { name: 'View overdue invoice INV-QUEUE' }));
  expect(await screen.findByText('Receipt-backed allocations: PKR 0.01')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Next queue items' }).hasAttribute('disabled')).toBe(
    true,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Close queue item' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next queue items' }));
  await waitFor(() =>
    expect(readDashboardQueue).toHaveBeenLastCalledWith(expect.anything(), branchId, 'overdue', {
      limit: 20,
      cursor: id(10),
    }),
  );
});
it('AUD-009 / ACC-002: live grant loss turns a direct destination back into noninteractive text', async () => {
  const cache = show(
    <DashboardQueueLink actorId={actorId} context="manager" queue="complaints" branchId={branchId}>
      Complaints
    </DashboardQueueLink>,
  );
  expect((await screen.findByRole('link', { name: 'Complaints' })).getAttribute('href')).toBe(
    dashboardQueuePath('manager', 'complaints', branchId),
  );
  vi.mocked(readInventoryAccess).mockResolvedValue({
    branchId,
    permissions: ['finance_view'],
    canConfigureManagers: false,
  });
  await cache.invalidateQueries({ queryKey: ['inventory-access', actorId, branchId] });
  await waitFor(() => expect(screen.queryByRole('link', { name: 'Complaints' })).toBeNull());
});
