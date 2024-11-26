import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  listAdminExplorer,
  readAdminExplorerDetail,
  readAdminExplorerSummary,
  readReport,
  type ApiClient,
} from '@hsm/api-client';
import { AdminExplorer, paisaText } from './admin-explorer';
import { ReportView } from './report-view';
vi.mock('../../lib/client', () => ({ browserClient: () => ({}) }));
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  readReport: vi.fn(),
  readAdminExplorerSummary: vi.fn(),
  listAdminExplorer: vi.fn(),
  readAdminExplorerDetail: vi.fn(),
}));
vi.mock('./admin-operations', async (original) => ({
  ...(await original<typeof import('./admin-operations')>()),
  useOperationScope: () => ({
    key: ['admin-test'],
    read: (work: (client: ApiClient) => Promise<unknown>) => work({} as ApiClient),
  }),
}));
const branchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  ownerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function wrap(node: React.ReactNode) {
  render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);
}
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
it('RPT-001: a report is read on screen for the same branch and dates as the downloads', async () => {
  vi.mocked(readReport).mockResolvedValue({
    type: 'occupancy',
    from: '2026-11-01',
    to: '2026-11-30',
    columns: ['Room', 'Beds'],
    rows: [['101', '4']],
    truncated: true,
  });
  const user = userEvent.setup();
  wrap(<ReportView actorId="owner" branchId={branchId} from="2026-11-01" to="2026-11-30" />);
  expect(readReport).not.toHaveBeenCalled();
  await user.selectOptions(screen.getByLabelText('View report on screen'), 'occupancy');
  expect(await screen.findByRole('columnheader', { name: 'Room' })).toBeTruthy();
  expect(screen.getByRole('cell', { name: '101' })).toBeTruthy();
  expect(screen.getByText(/More rows exist/)).toBeTruthy();
  expect(readReport).toHaveBeenCalledWith({}, 'occupancy', {
    branchId,
    from: '2026-11-01',
    to: '2026-11-30',
  });
});
function page(kind: string, rows: object[]) {
  return {
    kind,
    generatedAt: '2026-11-27T10:00:00.000Z',
    timezone: 'Asia/Karachi',
    data: rows,
    nextCursor: null,
    totalCount: rows.length,
    statistics: { month: 1, quarter: 1, year: 1, lifetime: rows.length },
    statisticsLabel: 'Registered',
    statuses: ['active'],
    quantity: null,
    amountPaisa: null,
    notice: '',
  };
}
const owner = {
  id: ownerId,
  name: 'Owner One',
  status: 'active',
  createdAt: '2026-10-01T05:00:00.000Z',
  parentId: null,
  parentName: null,
  quantity: null,
  amountPaisa: null,
  reason: null,
};
it('HMA-017: Root searches a directory, opens a profile and follows its related records', async () => {
  vi.mocked(readAdminExplorerSummary).mockResolvedValue({
    generatedAt: '2026-11-27T10:00:00.000Z',
    counts: {
      users: 10,
      owners: 2,
      managers: 3,
      hostels: 2,
      branches: 4,
      bookings: 5,
      complaints: 0,
      occupancy: 7,
      payments: 9,
      approvals: 1,
    },
  });
  vi.mocked(listAdminExplorer).mockImplementation(
    async (_c, kind) => page(kind, kind === 'owners' ? [owner] : []) as never,
  );
  vi.mocked(readAdminExplorerDetail).mockResolvedValue({
    kind: 'owners',
    record: owner,
    facts: [{ label: 'Hostels', value: '1' }],
    links: [{ label: 'Hostels of this owner', kind: 'hostels', ownerId }],
    action: 'customer_governance',
    notice: '',
  } as never);
  const user = userEvent.setup();
  wrap(<AdminExplorer actorId="root" />);
  await user.click(await screen.findByRole('button', { name: 'Owners · 2' }));
  await user.type(screen.getByLabelText('Search name or record ID'), 'Owner');
  await user.click(screen.getByRole('button', { name: 'Search directory' }));
  await waitFor(() =>
    expect(listAdminExplorer).toHaveBeenLastCalledWith(
      {},
      'owners',
      expect.objectContaining({ q: 'Owner' }),
    ),
  );
  await user.click(await screen.findByRole('button', { name: 'View profile Owner One' }));
  expect(await screen.findByText('Hostels')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Open Customer account governance' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Hostels of this owner' }));
  await waitFor(() =>
    expect(listAdminExplorer).toHaveBeenLastCalledWith(
      {},
      'hostels',
      expect.objectContaining({ ownerId }),
    ),
  );
  expect(paisaText('123456')).toBe('PKR 1,234.56');
});
