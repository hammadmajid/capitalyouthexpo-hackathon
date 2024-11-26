import { OwnerDashboardHero } from './owner-dashboard-hero';
/// <reference types="jest" />
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { OwnerDashboardEmpty } from './owner-dashboard-empty';
import { OwnerDashboardActive, shiftMonth } from './owner-dashboard-active';
import { OwnerScopePicker } from './owner-scope-picker';
import type { OwnerHomeData } from './use-owner-home';
const mockSession = {
  profile: {
    user: { id: 'u1', fullName: 'Test Owner', emailVerified: true },
    capabilities: { owner: true, customer: true, managerOf: [], admin: null },
  },
};
jest.mock('./providers', () => ({ useSession: () => mockSession }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock('./owner-draft-resume', () => ({ OwnerDraftResume: () => null }));
jest.mock('./owner-hostel-card', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    OwnerHostelCard: ({ hostel }: { hostel: { name: string } }) => (
      <Text>{'card:' + hostel.name}</Text>
    ),
  };
});
const ids = {
  brand: '019a1234-1234-7123-8123-000000000011',
  branch: '019a1234-1234-7123-8123-000000000012',
  org: '019a1234-1234-7123-8123-000000000013',
};
const zeroActions = {
  pendingBookings: 0,
  pendingProofs: 2,
  openComplaints: 0,
  upcomingCheckouts: 1,
  overdueInvoices: 0,
};
const beds = { beds: 0, occupied: 0, available: 0, reserved: 0, blocked: 0, unavailable: 0 };
const rent = {
  month: '2026-10',
  invoices: 0,
  expectedPaisa: 1234567,
  collectedPaisa: 1000000,
  outstandingPaisa: 234567,
  overdueInvoices: 0,
};
function home(status: string): OwnerHomeData {
  return {
    organization: { id: ids.org, name: 'Org' },
    hostels: {
      data: [{ id: ids.brand, organizationId: ids.org, name: 'Draft Hostel', logoFileId: null }],
    },
    branches: {
      data: {
        data: [
          {
            id: ids.branch,
            organizationId: ids.org,
            brandId: ids.brand,
            name: 'Main branch',
            verificationStatus: status,
          },
        ],
        nextCursor: null,
      },
    },
    dashboard: {
      data: {
        asOf: '2026-10-29',
        month: '2026-10',
        nextCursor: null,
        branches: [
          {
            branchId: ids.branch,
            branchName: 'Main branch',
            verificationStatus: status,
            beds,
            occupancyPercent: 0,
            activeResidents: 0,
            rent,
            actions: zeroActions,
            subscription: 'deferred',
          },
        ],
        totals: { beds, activeResidents: 0, confirmedBookings: 3, rent, actions: zeroActions },
      },
      isError: false,
    },
    previous: { data: undefined },
    notices: {
      data: {
        data: [
          {
            id: '019a1234-1234-7123-8123-000000000031',
            type: 'booking.requested',
            title: 'New booking request',
            body: 'b',
            readAt: null,
            createdAt: '2026-10-29T10:00:00Z',
          },
        ],
        nextCursor: null,
        unreadCount: 1,
      },
    },
  } as unknown as OwnerHomeData;
}
beforeEach(() => jest.clearAllMocks());
it('OWN-001: zero-hostel dashboard shows setup only, with Manager invitation honestly unavailable', async () => {
  await render(<OwnerDashboardEmpty />);
  expect(screen.getByText('Create your first hostel')).toBeTruthy();
  expect(screen.queryByText(/Rent|Revenue|Occupancy|PKR/)).toBeNull();
  const invite = screen.getByRole('button', { name: 'Invite Manager' });
  expect(invite.props.accessibilityState.disabled).toBe(true);
  expect(screen.getByText(/Save hostel Basic Information before inviting/)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Create Your First Hostel' }));
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/owner-setup',
    params: { step: 'basics' },
  });
});
it('OWN-001: a draft keeps Rooms & Beds one tap away; hostel cards live under Properties', async () => {
  await render(<OwnerDashboardActive actorId="u1" home={home('draft')} />);
  // Hostel cards are on Properties and verification on the draft card, not repeated here.
  expect(screen.queryByText('card:Draft Hostel')).toBeNull();
  expect(screen.queryByRole('button', { name: /^Verification/ })).toBeNull();
  expect(screen.queryByText(/^Active$|Approved/)).toBeNull();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Rooms & Beds. Buildings, floors, rooms' }),
  );
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/owner-setup',
    params: { brandId: ids.brand, step: 'rooms' },
  });
});
it('OWN-002..004: exact totals; only non-zero work is listed and each item opens its branch', async () => {
  await render(<OwnerDashboardActive actorId="u1" home={home('approved')} />);
  expect(screen.getByText('No beds yet')).toBeTruthy();
  expect(screen.getByText('PKR 10,000.00')).toBeTruthy();
  expect(screen.getByText('PKR 2,345.67')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Payment Proofs: 2' })).toBeTruthy();
  expect(screen.queryByText(/Booking requests awaiting review/)).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Payment Proofs: 2' }));
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/owner-branch',
    params: { branchId: ids.branch, tool: 'inventory' },
  });
  await fireEvent.press(screen.getByRole('button', { name: /View Reports/ }));
  expect(router.push).toHaveBeenCalledWith('/owner-reports');
});
it('OWN-004: month dropdown uses real calendar months and keeps current selection', async () => {
  const setMonth = jest.fn();
  await render(
    <OwnerScopePicker
      branches={[]}
      onChoose={jest.fn()}
      hasMore={false}
      month="2026-10"
      latestMonth="2026-10"
      onMonth={setMonth}
    />,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Choose dashboard month' }));
  await fireEvent.press(screen.getByRole('button', { name: 'September 2026' }));
  expect(setMonth).toHaveBeenCalledWith('2026-09');
  expect(shiftMonth('2026-01', -1)).toBe('2025-12');
});
it('OWN-002: confirmed bookings come from server data; activity lives behind the bell', async () => {
  await render(<OwnerDashboardActive actorId="u1" home={home('approved')} />);
  expect(screen.getByRole('button', { name: 'Bookings: 0' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /New booking request/ })).toBeNull();
});
it('OWN-001: the dashboard hero headline stays the same for every Owner state', async () => {
  const a = await render(
    <OwnerDashboardHero name="Owner" unread={0} onMenu={jest.fn()} onNotifications={jest.fn()} />,
  );
  expect(screen.getByRole('image', { name: 'Manage Your Hostel' })).toBeTruthy();
  await a.unmount();
  await render(
    <OwnerDashboardHero
      name="Another Owner"
      unread={3}
      onMenu={jest.fn()}
      onNotifications={jest.fn()}
    />,
  );
  expect(screen.getByRole('image', { name: 'Manage Your Hostel' })).toBeTruthy();
});
it('OWN-002: branch scope selection passes a real branch identifier, not a label', async () => {
  const choose = jest.fn();
  const branches = [
    { id: ids.branch, name: 'Islamabad Main' },
    { id: ids.org, name: 'Rawalpindi Branch' },
  ];
  await render(<OwnerScopePicker branches={branches} onChoose={choose} hasMore={false} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Choose branch: All Branches' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Rawalpindi Branch' }));
  expect(choose).toHaveBeenCalledWith(ids.org);
  await fireEvent.press(screen.getByRole('button', { name: 'Choose branch: All Branches' }));
  await fireEvent.press(screen.getByRole('button', { name: 'All Branches' }));
  expect(choose).toHaveBeenCalledWith(undefined);
});

it('OWN-001..004: reference dashboard groups collections, occupancy and compact queues without sample amounts', async () => {
  await render(<OwnerDashboardActive actorId="u1" home={home('approved')} />);
  for (const label of [
    'Collected Amount',
    'Income Trend',
    'Bed Occupancy',
    'Staff Salary Due',
    'Due Amount',
    'Overdue Amount',
    'Transport Requests',
    'Messages',
  ])
    expect(screen.getByText(label)).toBeTruthy();
  expect(screen.queryByText('PKR 58,966.67')).toBeNull();
});

it('OWN-004: Transport Requests opens the request queue, not the active subscriber list', async () => {
  await render(<OwnerDashboardActive actorId="u1" home={home('approved')} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Transport Requests: Unavailable' }));
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/owner-branch',
    params: { branchId: ids.branch, tool: 'transport-requests' },
  });
});

it('OWN-004: dues shortcuts reuse filtered Operations and preserve the selected invoice month', async () => {
  await render(<OwnerDashboardActive actorId="u1" home={home('approved')} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Due Amount: PKR 2,345.67' }));
  expect(router.push).toHaveBeenLastCalledWith({
    pathname: '/owner-branch',
    params: { branchId: ids.branch, tool: 'stays-due', month: '2026-10' },
  });
  await fireEvent.press(screen.getByRole('button', { name: 'Overdue Amount: Unavailable' }));
  expect(router.push).toHaveBeenLastCalledWith({
    pathname: '/owner-branch',
    params: { branchId: ids.branch, tool: 'stays-overdue', month: '2026-10' },
  });
  await fireEvent.press(screen.getByRole('button', { name: 'Staff Salary Due: Unavailable' }));
  expect(router.push).toHaveBeenLastCalledWith({
    pathname: '/owner-branch',
    params: { branchId: ids.branch, tool: 'staff-due', month: '2026-10' },
  });
});

it('OWN-001: supplied heading artwork preserves dashboard and notification action', async () => {
  const notify = jest.fn();
  await render(
    <OwnerDashboardHero name="Owner" unread={2} onMenu={jest.fn()} onNotifications={notify} />,
  );
  expect(screen.getByText('Dashboard')).toBeTruthy();
  expect(screen.getByRole('image', { name: 'Manage Your Hostel' })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Notifications, 2 unread' }));
  expect(notify).toHaveBeenCalledTimes(1);
});
