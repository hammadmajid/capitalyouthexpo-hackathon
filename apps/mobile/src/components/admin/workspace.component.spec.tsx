import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import { platformAnalyticsQuerySchema, type SelfProfile } from '@hsm/contracts';
import * as sdk from '@hsm/api-client';
import { AdminAccess } from './access';
import { AdminHome } from './home';
import { AdminOperations } from './operations-nav';
import { AdminWorkspace } from './workspace';
import { AdminAccounts } from './accounts';
import { AdminDetail } from './detail';
import { InviteAdmin } from './invite';
import { AdminInvitationScreen } from './invitation';
import { AdminModes } from './modes';
const id = '10000000-0000-4000-8000-000000000001';
const target = '10000000-0000-4000-8000-000000000002';
let mockParams: { userId?: string; roots?: string } = {};
let mockProfile: SelfProfile;
const mockRefresh = jest.fn();
jest.mock('../providers', () => ({
  useSession: () => ({ profile: mockProfile, refetch: mockRefresh }),
}));
jest.mock('../../lib/runtime', () => ({
  actorClient: async () => ({}),
  sessions: { restore: jest.fn() },
}));
jest.mock('../../lib/owner-mode', () => ({ rememberMode: jest.fn(async () => undefined) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'ffffffff-ffff-4fff-8fff-ffffffffffff' }));
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    router: { push: jest.fn(), replace: jest.fn() },
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (callback: import('react').EffectCallback) =>
      React.useEffect(callback, [callback]),
    Redirect: ({ href }: { href: string }) => <Text>{'redirect:' + href}</Text>,
  };
});
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
  listAdmins: jest.fn(),
  readPlatformOverview: jest.fn(),
  listAdminExplorer: jest.fn(),
  readAdminExplorerSummary: jest.fn(),
  readAdminAccount: jest.fn(),
  readOwnAdmin: jest.fn(),
  inviteAdmin: jest.fn(),
  changeAdmin: jest.fn(),
  acceptAdminInvitation: jest.fn(),
}));
const normal = {
  userId: target,
  fullName: 'Staff fixture',
  isRoot: false,
  status: 'active' as const,
  roles: ['support' as const],
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(sdk.readPlatformOverview).mockRejectedValue(new Error('Unavailable fixture'));
  jest.mocked(sdk.readAdminExplorerSummary).mockRejectedValue(new Error('Unavailable fixture'));
  mockParams = { userId: target };
  mockProfile = {
    user: { id, fullName: 'Root fixture', email: null, emailVerified: true, cnicLast4: null },
    capabilities: {
      customer: true,
      owner: true,
      managerOf: [],
      admin: { isRoot: true, roles: [] },
    },
  };
  mockRefresh.mockImplementation(async () => mockProfile);
  jest
    .mocked(sdk.listAdmins)
    .mockResolvedValue({ data: [normal], nextCursor: null, totalCount: 2, activeRootCount: 1 });
  jest.mocked(sdk.readAdminAccount).mockResolvedValue(normal);
  jest.mocked(sdk.readOwnAdmin).mockResolvedValue({ ...normal, userId: id });
  jest.mocked(sdk.inviteAdmin).mockResolvedValue({ ...normal, status: 'invited' });
  jest.mocked(sdk.changeAdmin).mockResolvedValue(normal);
  jest.mocked(sdk.acceptAdminInvitation).mockResolvedValue({ ...normal, userId: id });
});
async function show(node: ReactNode) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const result = await render(<QueryClientProvider client={cache}>{node}</QueryClientProvider>);
  return { cache, ...result };
}
it('ADM-001 SEC-003: staff content is hidden until fresh permission; customer and Normal Root deep links deny', async () => {
  let resolve: ((p: SelfProfile) => void) | undefined;
  mockRefresh.mockReturnValue(
    new Promise<SelfProfile>((done) => {
      resolve = done;
    }),
  );
  const ui = await show(
    <AdminAccess>
      <Text>Private staff content</Text>
    </AdminAccess>,
  );
  expect(screen.queryByText('Private staff content')).toBeNull();
  await act(async () => {
    resolve?.(mockProfile);
  });
  expect(await screen.findByText('Private staff content')).toBeTruthy();
  mockProfile = { ...mockProfile, capabilities: { ...mockProfile.capabilities, admin: null } };
  await ui.rerender(
    <QueryClientProvider client={ui.cache}>
      <AdminAccess>
        <Text>Private staff content</Text>
      </AdminAccess>
    </QueryClientProvider>,
  );
  expect(screen.queryByText('Private staff content')).toBeNull();
  expect(screen.getByText('redirect:/account')).toBeTruthy();
  mockProfile = {
    ...mockProfile,
    capabilities: { ...mockProfile.capabilities, admin: { isRoot: false, roles: ['support'] } },
  };
  await ui.rerender(
    <QueryClientProvider client={ui.cache}>
      <AdminAccess rootOnly>
        <Text>Root content</Text>
      </AdminAccess>
    </QueryClientProvider>,
  );
  expect(screen.queryByText('Root content')).toBeNull();
  expect(screen.getByText('redirect:/account')).toBeTruthy();
});
it('SEC-003: failed fresh permission never mounts staff data and offers safe retry', async () => {
  mockRefresh.mockResolvedValue(undefined);
  await show(
    <AdminAccess>
      <Text>Private staff content</Text>
    </AdminAccess>,
  );
  expect(await screen.findByText('Admin access unavailable')).toBeTruthy();
  expect(screen.queryByText('Private staff content')).toBeNull();
  expect(screen.getByRole('button', { name: 'Retry Admin access' })).toBeTruthy();
});
it('ADM-001: Root main screen exposes daily operations directly and keeps team management behind its entry', async () => {
  await show(<AdminHome />);
  expect(screen.getByText('Dashboard')).toBeTruthy();
  // VER: Hostel verifications lead the dashboard once; Operations no longer repeats it, and
  // suspensions live on each user's and hostel's own screen.
  const verification = screen.getAllByRole('button', { name: /^Hostel verifications/ });
  expect(verification).toHaveLength(1);
  expect(screen.queryByRole('button', { name: /^Verification/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /Customer suspensions/ })).toBeNull();
  const [top] = verification;
  if (top) await fireEvent.press(top);
  expect(router.push).toHaveBeenCalledWith('/admin/verifications');
  expect(screen.queryByRole('button', { name: 'Manage Admins' })).toBeNull();
  expect(sdk.listAdmins).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Admin management' }));
  expect(router.push).toHaveBeenCalledWith('/admin/management');
});
it('ADM-002: Root dashboard is actionable, shows true management summary and navigates', async () => {
  await show(<AdminWorkspace />);
  await fireEvent.press(await screen.findByRole('button', { name: '2 Admins' }));
  expect(router.push).toHaveBeenCalledWith('/admin/admins');
  expect(screen.queryByText(/Revenue/)).toBeNull();
});
it('ADM-001: native AbortSignal without throwIfAborted still loads authorized summary', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'throwIfAborted');
  Object.defineProperty(AbortSignal.prototype, 'throwIfAborted', {
    configurable: true,
    value: undefined,
  });
  try {
    await show(<AdminWorkspace />);
    expect(await screen.findByLabelText('2 Admins')).toBeTruthy();
    expect(sdk.listAdmins).toHaveBeenCalled();
  } finally {
    if (descriptor) Object.defineProperty(AbortSignal.prototype, 'throwIfAborted', descriptor);
    else Reflect.deleteProperty(AbortSignal.prototype, 'throwIfAborted');
  }
});
it('ADM-003: Normal landing has only assigned roles and never requests the Root list or shows a refresh control', async () => {
  mockProfile.capabilities.admin = { isRoot: false, roles: ['support'] };
  await show(<AdminWorkspace />);
  expect(screen.getAllByText('Support').length).toBeGreaterThan(0);
  expect(screen.queryByRole('button', { name: /Admins$/ })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Verification' })).toBeNull();
  expect(screen.queryByRole('button', { name: /refresh/i })).toBeNull();
  expect(sdk.listAdmins).not.toHaveBeenCalled();
});
it('CHG-005 SEC-003: Customer/Owner switching keeps identity and removes staff cache', async () => {
  const ui = await show(<AdminModes />);
  ui.cache.setQueryData(['platform-admin', id], 'private');
  await fireEvent.press(screen.getByRole('button', { name: 'Switch to Customer' }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/marketplace'));
  expect(ui.cache.getQueryData(['platform-admin', id])).toBeUndefined();
  expect(mockProfile.user.id).toBe(id);
  await fireEvent.press(screen.getByRole('button', { name: 'Switch to Owner' }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/owner'));
});
it('ADM-001: Admin list traverses pages and marks complete without credential fields', async () => {
  jest
    .mocked(sdk.listAdmins)
    .mockResolvedValueOnce({
      data: [normal],
      nextCursor: target,
      totalCount: 3,
      activeRootCount: 1,
    })
    .mockResolvedValueOnce({
      data: [{ ...normal, userId: id, fullName: 'Later fixture' }],
      nextCursor: null,
      totalCount: 3,
      activeRootCount: 1,
    });
  await show(<AdminAccounts />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Load more Admins' }));
  expect(await screen.findByText('Later fixture')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Load more Admins' })).toBeNull();
  expect(jest.mocked(sdk.listAdmins).mock.calls[1]?.[1]).toEqual({ limit: 20, cursor: target });
});
it('ADM-002/003: multi-role invitation is explicit and uses shared email API', async () => {
  await show(<InviteAdmin />);
  await fireEvent.changeText(screen.getByLabelText('Existing account email'), 'staff@example.test');
  await fireEvent.press(screen.getByRole('button', { name: 'Add role: Support' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Add role: Verification' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Review invitation' }));
  expect(sdk.inviteAdmin).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm Admin invitation' }));
  await waitFor(() => expect(sdk.inviteAdmin).toHaveBeenCalled());
  expect(jest.mocked(sdk.inviteAdmin).mock.calls[0]?.[1]).toEqual({
    email: 'staff@example.test',
    roles: ['support', 'verification'],
  });
});
it('ADM-001..004: promotion requires a reason and confirmation and uses original change protocol', async () => {
  await show(<AdminDetail />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Promote to Root' }));
  expect(sdk.changeAdmin).not.toHaveBeenCalled();
  await fireEvent.changeText(
    screen.getByLabelText('Reason for Admin change'),
    'Approved responsibility',
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm Admin change' }));
  await waitFor(() => expect(sdk.changeAdmin).toHaveBeenCalled());
  expect(jest.mocked(sdk.changeAdmin).mock.calls[0]?.[2]).toEqual({
    change: 'root',
    isRoot: true,
    reason: 'Approved responsibility',
  });
});
it('ADM-002: own invited access is inactive until explicit acceptance and capability refresh', async () => {
  mockProfile.capabilities.admin = null;
  jest.mocked(sdk.readOwnAdmin).mockResolvedValue({ ...normal, userId: id, status: 'invited' });
  await show(<AdminInvitationScreen />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Accept Admin invitation' }));
  await waitFor(() => expect(sdk.acceptAdminInvitation).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  expect(mockProfile.capabilities.admin).toBeNull();
});

it.each([
  ['Suspend Admin', 'active', false, { change: 'status', status: 'suspended' }],
  ['Reactivate Admin', 'suspended', false, { change: 'status', status: 'active' }],
  ['Deactivate Admin', 'active', false, { change: 'status', status: 'deactivated' }],
  ['Demote Root', 'active', true, { change: 'root', isRoot: false }],
] as const)(
  'ADM-001..004: %s requires explicit confirmation and a reason',
  async (label, status, isRoot, expected) => {
    jest.mocked(sdk.readAdminAccount).mockResolvedValue({ ...normal, status, isRoot });
    await show(<AdminDetail />);
    await fireEvent.press(await screen.findByRole('button', { name: label }));
    expect(sdk.changeAdmin).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Reason for Admin change'), 'Approved change');
    await fireEvent.press(screen.getByRole('button', { name: 'Confirm Admin change' }));
    await waitFor(() => expect(sdk.changeAdmin).toHaveBeenCalled());
    expect(jest.mocked(sdk.changeAdmin).mock.calls[0]?.[2]).toEqual({
      ...expected,
      reason: 'Approved change',
    });
  },
);
it('ADM-003: editing roles submits only supported selected roles with an explicit reason', async () => {
  await show(<AdminDetail />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Edit Admin roles' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Add role: Verification' }));
  await fireEvent.changeText(
    screen.getByLabelText('Reason for Admin change'),
    'Responsibility changed',
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm Admin change' }));
  await waitFor(() => expect(sdk.changeAdmin).toHaveBeenCalled());
  expect(jest.mocked(sdk.changeAdmin).mock.calls[0]?.[2]).toEqual({
    change: 'roles',
    roles: ['support', 'verification'],
    reason: 'Responsibility changed',
  });
});

it('HMA-017: premium overview shows real metrics, unavailable income and functional date periods without expenses', async () => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
  jest.mocked(sdk.readAdminExplorerSummary).mockResolvedValue({
    generatedAt: new Date().toISOString(),
    counts: {
      users: 12,
      owners: 3,
      managers: 1,
      hostels: 2,
      branches: 4,
      bookings: 5,
      complaints: 0,
      occupancy: 1,
      payments: 2,
      approvals: 1,
    },
  });
  const snapshot = {
    users: 12,
    customers: 9,
    owners: 3,
    activeBranches: 4,
    publishedListings: 2,
    activeManagers: 1,
    verificationPending: 2,
    supportPending: 1,
    moderationPending: 0,
    announcements: { scheduled: 0, sent: 0, cancelled: 0 },
  };
  jest.mocked(sdk.readPlatformOverview).mockImplementation(async (_client, input) => {
    const range = platformAnalyticsQuerySchema.parse(input);
    return {
      generatedAt: new Date().toISOString(),
      timezone: 'Asia/Karachi',
      ...range,
      snapshot,
      window: {
        registeredUsers: 2,
        bookingRequests: 5,
        bookingStates: [],
        conversations: 0,
        visitRequests: 3,
        checkedIn: 1,
        respondedRequests: 0,
        averageResponseHours: null,
        slowResponses: 0,
      },
      coverage: {
        searches: 'not_collected',
        listingViews: 'not_collected',
        commercialRetention: 'deferred',
        occupancyFreshness: 'not_collected',
      },
    };
  });
  const ui = await show(<AdminHome />);
  expect(await screen.findByLabelText('12 Users')).toBeTruthy();
  expect(screen.getByText('Not tracked')).toBeTruthy();
  expect(screen.queryByText(/expenses/i)).toBeNull();
  expect(sdk.readPlatformOverview).toHaveBeenCalledWith(expect.anything(), {
    from: today.slice(0, 7) + '-01',
    to: today,
  });
  await fireEvent.press(screen.getByRole('button', { name: 'Today analytics' }));
  await waitFor(() =>
    expect(sdk.readPlatformOverview).toHaveBeenCalledWith(expect.anything(), {
      from: today,
      to: today,
    }),
  );
  const quarterMonth = String(Math.floor((Number(today.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(
    2,
    '0',
  );
  await fireEvent.press(screen.getByRole('button', { name: 'This quarter analytics' }));
  await waitFor(() =>
    expect(sdk.readPlatformOverview).toHaveBeenCalledWith(expect.anything(), {
      from: today.slice(0, 4) + '-' + quarterMonth + '-01',
      to: today,
    }),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'This year analytics' }));
  await waitFor(() =>
    expect(sdk.readPlatformOverview).toHaveBeenCalledWith(expect.anything(), {
      from: today.slice(0, 4) + '-01-01',
      to: today,
    }),
  );
  jest.mocked(sdk.listAdminExplorer).mockResolvedValue({
    kind: 'users',
    generatedAt: new Date().toISOString(),
    timezone: 'Asia/Karachi',
    data: [
      {
        id,
        name: 'First account',
        status: 'active',
        createdAt: '2021-03-04T20:00:00Z',
        parentId: null,
        parentName: null,
        quantity: null,
        amountPaisa: null,
        reason: null,
      },
    ],
    nextCursor: null,
    totalCount: 1,
    statistics: { month: 0, quarter: 0, year: 0, lifetime: 1 },
    statisticsLabel: 'Account cohorts',
    statuses: ['active'],
    quantity: null,
    amountPaisa: null,
    notice: '',
  });
  await fireEvent.press(screen.getByRole('button', { name: 'Lifetime analytics' }));
  await waitFor(() =>
    expect(sdk.readPlatformOverview).toHaveBeenCalledWith(expect.anything(), {
      from: '2021-03-05',
      to: today,
    }),
  );
  expect(sdk.listAdminExplorer).toHaveBeenCalledWith(expect.anything(), 'users', {
    sort: 'oldest',
    limit: 1,
  });
  await screen.findByLabelText('12 Users');
  expect(screen.queryByText('Needs attention')).toBeNull();
  expect(screen.queryByText('Approved branches')).toBeNull();
  const cards = screen.getAllByRole('button');
  // Hostel verifications (with the waiting count) lead, above the Totals.
  expect(
    cards.findIndex((b) => b.props.accessibilityLabel === 'Hostel verifications: 2 waiting'),
  ).toBeLessThan(cards.findIndex((b) => b.props.accessibilityLabel === '12 Users'));
  expect(screen.queryByLabelText('2 Awaiting verification')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Hostel verifications: 2 waiting' }));
  // ADM-007: Pending opens the verification queue directly.
  expect(router.push).toHaveBeenCalledWith('/admin/verifications');
  await fireEvent.press(screen.getByRole('button', { name: 'Support, 1 pending' }));
  expect(router.push).toHaveBeenCalledWith('/admin/support');
  expect(screen.queryByRole('button', { name: /refresh/i })).toBeNull();
  const overview = await jest.mocked(sdk.readPlatformOverview).mock.results.at(-1)?.value;
  const summary = await jest.mocked(sdk.readAdminExplorerSummary).mock.results.at(-1)?.value;
  if (!overview || !summary) throw new Error('Missing initial dashboard data');
  let finish: ((value: typeof summary) => void) | undefined;
  jest.mocked(sdk.readPlatformOverview).mockResolvedValueOnce({
    ...overview,
    snapshot: { ...overview.snapshot, verificationPending: 0 },
  });
  jest.mocked(sdk.readAdminExplorerSummary).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  let update: Promise<void> | undefined;
  await act(() => {
    update = ui.cache.invalidateQueries({ queryKey: ['platform-admin', id] });
  });
  await waitFor(() => expect(finish).toBeDefined());
  expect(screen.getByLabelText('12 Users')).toBeTruthy();
  expect(screen.getByLabelText('Hostel verifications: 2 waiting')).toBeTruthy();
  await act(async () => {
    finish?.({ ...summary, counts: { ...summary.counts, users: 13 } });
    await update;
  });
  await screen.findByLabelText('13 Users');
  expect(screen.getByRole('button', { name: 'Hostel verifications: 0 waiting' })).toBeTruthy();
});

it('ADM-001: operations workspace retains working authorized actions', async () => {
  await show(<AdminOperations />);
  expect(screen.queryByRole('button', { name: 'Verification' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Support' }));
  expect(router.push).toHaveBeenCalledWith('/admin/support');
});

it('CHG-005: Root header Customer shortcut reuses same-identity switching and clears staff data', async () => {
  const ui = await show(<AdminHome />);
  ui.cache.setQueryData(['platform-admin', id, 'private'], 'staff');
  await fireEvent.press(screen.getByRole('button', { name: 'Customer account' }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/marketplace'));
  expect(ui.cache.getQueryData(['platform-admin', id, 'private'])).toBeUndefined();
});
it.each([true, false])(
  'CHG-005: incomplete Customer profile uses safe onboarding (verified=%s)',
  async (verified) => {
    mockProfile.capabilities.customer = false;
    mockProfile.user.emailVerified = verified;
    await show(<AdminHome />);
    await fireEvent.press(screen.getByRole('button', { name: 'Customer account' }));
    expect(router.push).toHaveBeenCalledWith(verified ? '/customer-profile' : '/account');
    expect(router.replace).not.toHaveBeenCalledWith('/marketplace');
  },
);
