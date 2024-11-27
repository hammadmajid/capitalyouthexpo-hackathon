import type { ReactNode } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as sdk from '@hsm/api-client';
import { adminExplorerPageSchema, adminExplorerDetailSchema } from '@hsm/contracts';
import { ExplorerList, paisaText } from './explorer-list';
import { ExplorerDetail } from './explorer-detail';
const id = '10000000-0000-4000-8000-000000000001',
  next = '10000000-0000-4000-8000-000000000002';
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('../providers', () => ({
  useSession: () => ({ profile: { capabilities: { admin: { isRoot: true, roles: [] } } } }),
}));
jest.mock('./data', () => ({
  useAdminData: () => ({
    key: ['platform-admin', 'root'],
    read: async (work: (client: object) => Promise<unknown>) => work({}),
  }),
  useAdminCommand: () => ({
    isPending: false,
    unresolved: false,
    isError: false,
    mutate: jest.fn(),
    reset: jest.fn(),
  }),
}));
jest.mock('../frame', () => {
  const { Text, View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Page: ({ title, children }: { title: string; children: ReactNode }) => (
      <View>
        <Text>{title}</Text>
        {children}
      </View>
    ),
  };
});
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  listAdminExplorer: jest.fn(),
  readAdminExplorerDetail: jest.fn(),
  readVerificationDossier: jest.fn(),
}));
const row = {
  id,
  name: 'Directory account',
  status: 'active',
  createdAt: '2026-10-31T00:00:00Z',
  parentId: null,
  parentName: null,
  quantity: null,
  amountPaisa: null,
  reason: null,
};
const page = adminExplorerPageSchema.parse({
  kind: 'users',
  generatedAt: '2026-10-31T00:00:00Z',
  timezone: 'Asia/Karachi',
  data: [row],
  nextCursor: 'next-page',
  totalCount: 2,
  statistics: { month: 1, quarter: 1, year: 2, lifetime: 2 },
  statisticsLabel: 'Account registration cohorts',
  statuses: ['active', 'suspended'],
  quantity: null,
  amountPaisa: null,
  notice: 'Metadata only',
});
async function show(node: ReactNode) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      {node}
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(sdk.listAdminExplorer).mockImplementation(async (_client, _kind, query) => {
    return typeof query === 'object' && query !== null && 'cursor' in query
      ? { ...page, data: [{ ...row, id: next, name: 'Second account' }], nextCursor: null }
      : page;
  });
  jest.mocked(sdk.readAdminExplorerDetail).mockResolvedValue(
    adminExplorerDetailSchema.parse({
      kind: 'users',
      record: row,
      facts: [{ label: 'Account status', value: 'active' }],
      links: [{ label: 'Owned hostel businesses', kind: 'hostels', ownerId: id }],
      action: 'none',
      notice: 'Metadata only',
    }),
  );
});
it('HMA-017: directory search, period, sorting, pagination and profile navigation use real client commands', async () => {
  await show(<ExplorerList kind="users" filters={{}} />);
  await screen.findByText('Directory account');
  await fireEvent.press(screen.getByRole('button', { name: 'Filters and sorting' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Search Registered users' }));
  await fireEvent.changeText(screen.getByLabelText('Search name or record ID'), 'Filtered name');
  await fireEvent.press(screen.getByRole('button', { name: 'Search directory' }));
  await waitFor(() =>
    expect(sdk.listAdminExplorer).toHaveBeenCalledWith(
      expect.anything(),
      'users',
      expect.objectContaining({ q: 'Filtered name' }),
    ),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'name asc' }));
  await waitFor(() =>
    expect(sdk.listAdminExplorer).toHaveBeenCalledWith(
      expect.anything(),
      'users',
      expect.objectContaining({ sort: 'name_asc' }),
    ),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'month' }));
  await waitFor(() =>
    expect(sdk.listAdminExplorer).toHaveBeenCalledWith(
      expect.anything(),
      'users',
      expect.objectContaining({ period: 'month' }),
    ),
  );
  await screen.findByText('Directory account');
  await fireEvent.press(screen.getByRole('button', { name: 'Load more' }));
  await screen.findByText('Second account');
  await fireEvent.press(screen.getByRole('button', { name: 'View profile Second account' }));
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/admin/explorer/[kind]/[id]',
    params: { kind: 'users', id: next },
  });
});
it('HMA-017: profiles link into scoped child directories without exposing private documents or unavailable actions', async () => {
  await show(<ExplorerDetail kind="users" id={id} />);
  await screen.findByText('Directory account');
  await fireEvent.press(screen.getByRole('button', { name: 'Owned hostel businesses' }));
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/admin/explorer/[kind]',
    params: { kind: 'hostels', ownerId: id },
  });
  expect(screen.queryByText('Open branch verification and history')).toBeNull();
  expect(screen.getByText('Metadata only')).toBeTruthy();
});
it('HMA-017 PAY-008: aggregate money formatting preserves integer paisa without float rounding', () => {
  expect(paisaText('900719925474099301')).toBe('PKR 9,007,199,254,740,993.01');
});

it('HMA-017: data notes remain available without obstructing directory records', async () => {
  await show(<ExplorerList kind="users" filters={{}} />);
  await screen.findByText('Directory account');
  expect(screen.queryByText('Metadata only')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Data notes' }));
  expect(screen.getByText('Metadata only')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Data notes' }));
  expect(screen.queryByText('Metadata only')).toBeNull();
});

it.each([
  'users',
  'owners',
  'managers',
  'hostels',
  'branches',
  'bookings',
  'complaints',
  'occupancy',
  'payments',
] as const)(
  'HMA-017: %s has one period control with real counts inside filters and no statistics card',
  async (kind) => {
    await show(<ExplorerList kind={kind} filters={{}} />);
    await screen.findByText('Directory account');
    expect(screen.queryByText('Account registration cohorts')).toBeNull();
    expect(screen.queryByText('This month')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Filters and sorting' }));
    expect(screen.getByText('This month · 1')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'month' })).toHaveLength(1);
    await fireEvent.press(screen.getByRole('button', { name: 'month' }));
    await waitFor(() =>
      expect(sdk.listAdminExplorer).toHaveBeenLastCalledWith(
        expect.anything(),
        kind,
        expect.objectContaining({ period: 'month' }),
      ),
    );
  },
);
it('CHG-036: Complaints opens chat reports for staff allowed to review them', async () => {
  await show(<ExplorerList kind="complaints" filters={{}} />);
  await fireEvent.press(
    await screen.findByLabelText('Open chat reports', undefined, { timeout: 5000 }),
  );
  expect(router.push).toHaveBeenCalledWith('/admin/safety');
});
it('ADM-007: a hostel branch screen offers Suspend hostel, and Lift suspension once suspended', async () => {
  const branch = adminExplorerDetailSchema.parse({
    kind: 'branches',
    record: { ...row, name: 'G-10 branch' },
    facts: [],
    links: [],
    action: 'verification',
    notice: 'Metadata only',
  });
  jest.mocked(sdk.readAdminExplorerDetail).mockResolvedValue(branch);
  const dossier = { branchId: id, status: 'approved', updatedAt: '2026-11-01T00:00:00Z' };
  jest.mocked(sdk.readVerificationDossier).mockResolvedValue(dossier as never);
  const first = await show(<ExplorerDetail kind="branches" id={id} />);
  expect(await screen.findByRole('button', { name: 'Suspend hostel' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  first.unmount();
  jest
    .mocked(sdk.readVerificationDossier)
    .mockResolvedValue({ ...dossier, status: 'suspended' } as never);
  await show(<ExplorerDetail kind="branches" id={id} />);
  expect(await screen.findByRole('button', { name: 'Lift suspension' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Suspend hostel' })).toBeNull();
});
