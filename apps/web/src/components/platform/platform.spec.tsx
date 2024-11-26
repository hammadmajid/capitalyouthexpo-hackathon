import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import * as sdk from '@hsm/api-client';
import { BranchDashboard, OwnerDashboard, ReportDownloads } from './dashboards';
import { AdminConsole } from './admin-console';
import { AdminInvitation, HelpSupport } from './help-support';
const names = vi.hoisted(() => [
  'readOwnerDashboard',
  'readBranchDashboard',
  'readOwnerAnalytics',
  'listAdmins',
  'inviteAdmin',
  'changeAdmin',
  'readVerificationQueue',
  'decideVerification',
  'readReviewReports',
  'moderateReview',
  'dismissReviewReport',
  'readSupportQueue',
  'readSupportTicket',
  'actOnSupportTicket',
  'readAnnouncements',
  'readAdminAnnouncements',
  'listGovernedCustomers',
  'readVerificationSnapshots',
  'readVerificationSnapshotItems',
  'readOwnSupportMessages',
  'createAnnouncement',
  'cancelAnnouncement',
  'readOwnTickets',
  'readOwnTicket',
  'openSupportTicket',
  'replyOwnTicket',
  'readOwnAdmin',
  'acceptAdminInvitation',
  'readVerificationDossier',
  'readVerificationHistory',
  'readVerificationPricing',
  'readVerificationPhotos',
  'submitVerificationDecision',
  'listModerationReports',
  'listModeratedReviews',
  'readModerationReview',
  'readModerationHistory',
  'readAdminSupportQueue',
  'readAdminSupportMessages',
]);
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  ...Object.fromEntries(names.map((name) => [name, vi.fn()])),
}));
vi.mock('../../lib/client', () => ({ browserClient: () => ({}) }));
vi.mock('./admin-operations', async (original) => ({
  ...(await original<typeof import('./admin-operations')>()),
  useOperationScope: (actorId: string, module: string) => ({
    key: ['platform-admin-web', actorId, module],
    read: async (work: (client: object) => Promise<unknown>) => work({}),
  }),
}));
const ids = {
  branch: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  item: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
};
const at = '2026-10-26T10:00:00.000Z';
const beds = { beds: 10, occupied: 6, available: 3, reserved: 1, blocked: 0, unavailable: 0 };
const rent = {
  month: '2026-10',
  invoices: 6,
  expectedPaisa: 10800000,
  collectedPaisa: 7200000,
  outstandingPaisa: 3600000,
  overdueInvoices: 2,
};
const actions = {
  pendingBookings: 1,
  pendingProofs: 2,
  openComplaints: 3,
  upcomingCheckouts: 1,
  overdueInvoices: 2,
};
const branchRow = {
  branchId: ids.branch,
  branchName: 'F-6 Boys',
  verificationStatus: 'approved',
  beds,
  occupancyPercent: 60,
  activeResidents: 6,
  rent,
  actions,
  subscription: 'deferred',
};
const ticket = {
  id: ids.item,
  subject: 'OTP',
  category: 'account',
  priority: 'normal',
  status: 'waiting_for_user',
  openedByName: 'Ali',
  assignedToName: null,
  version: 2,
  createdAt: at,
  updatedAt: at,
  messages: [
    {
      id: ids.item,
      authorName: 'Sara',
      fromSupport: true,
      internal: false,
      body: 'Try again',
      createdAt: at,
    },
  ],
};
function show(node: ReactNode) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>,
  );
}
const mock = (name: string, value: unknown) =>
  vi
    .mocked(sdk[name as keyof typeof sdk] as never as ReturnType<typeof vi.fn>)
    .mockResolvedValue(value);
beforeEach(() => {
  vi.resetAllMocks();
  mock('readOwnerDashboard', {
    asOf: '2026-10-26',
    month: '2026-10',
    branches: [branchRow],
    totals: { beds, activeResidents: 6, rent, actions },
  });
  mock('readBranchDashboard', {
    branchId: ids.branch,
    asOf: '2026-10-26',
    today: { moveIns: 1, checkouts: 0, visits: 2 },
    queue: actions,
    beds,
    unreadNotices: 3,
    rent: null,
  });
  mock('readOwnerAnalytics', {
    from: '2026-10-01',
    to: '2026-10-26',
    branches: [
      {
        branchId: ids.branch,
        branchName: 'F-6 Boys',
        listingViews: null,
        searches: null,
        conversations: 4,
        visitRequests: 3,
        bookingRequests: 2,
        confirmed: 1,
        rejected: 0,
        expired: 1,
        checkedIn: 1,
        averageResponseHours: 5,
        slowResponses: 0,
        warnings: [],
      },
    ],
    coverage: { listingViews: 'not_collected', searches: 'not_collected' },
  });
  mock('listAdmins', {
    data: [
      { userId: ids.item, fullName: 'Sara', isRoot: false, status: 'active', roles: ['support'] },
    ],
  });
  mock('readVerificationQueue', {
    data: [
      {
        branchId: ids.branch,
        branchName: 'G-9 Girls',
        organizationName: 'Org',
        status: 'submitted',
        updatedAt: at,
      },
    ],
    nextCursor: null,
  });
  mock('readReviewReports', {
    data: [
      {
        reportId: ids.item,
        reviewId: ids.item,
        branchId: ids.branch,
        reason: 'spam',
        details: null,
        status: 'open',
        reviewStatus: 'published',
        reviewBody: 'Buy now at spam.example',
        reviewVersion: 1,
        createdAt: at,
      },
    ],
    nextCursor: null,
  });
  mock('readSupportQueue', { data: [{ ...ticket, messages: undefined }], nextCursor: null });
  mock('readSupportTicket', ticket);
  mock('readAdminSupportQueue', { data: [{ ...ticket, messages: undefined }], nextCursor: null });
  mock('readAdminSupportMessages', {
    ticketId: ticket.id,
    data: ticket.messages,
    nextCursor: null,
  });
  mock('listModerationReports', {
    data: [
      {
        reportId: ids.item,
        reviewId: ids.item,
        reason: 'spam',
        reviewBody: 'Buy now at spam.example',
        reviewStatus: 'published',
        reviewVersion: 1,
        status: 'open',
        createdAt: at,
      },
    ],
    nextCursor: null,
  });
  mock('listModeratedReviews', { data: [], nextCursor: null });
  mock('readModerationReview', {
    reviewId: ids.item,
    branchId: ids.branch,
    body: 'Buy now at spam.example',
    status: 'published',
    moderationReason: null,
    version: 1,
    createdAt: at,
    editedAt: null,
  });
  mock('readModerationHistory', { data: [], nextCursor: null });
  mock('readVerificationDossier', {
    branchId: ids.branch,
    branchName: 'G-9 Girls',
    organizationName: 'Org',
    status: 'submitted',
    updatedAt: at,
    submittedAt: at,
    owner: { fullName: 'Owner fixture' },
    evidence: [],
  });
  mock('readVerificationHistory', { data: [], nextCursor: null });
  mock('readVerificationPricing', { data: [], nextCursor: null });
  mock('readVerificationPhotos', { data: [], nextCursor: null });
  mock('submitVerificationDecision', {});
  mock('listGovernedCustomers', { data: [], nextCursor: null });
  mock('readVerificationSnapshots', {
    current: null,
    lastApproved: null,
    changedFields: [],
    historicalSnapshotUnavailable: true,
  });
  mock('readVerificationSnapshotItems', { data: [], nextCursor: null });
  mock('readOwnSupportMessages', { ticketId: ticket.id, data: ticket.messages, nextCursor: null });
  mock('readAdminAnnouncements', {
    data: [
      {
        id: ids.item,
        audience: 'customers',
        title: 'Maintenance',
        body: 'b',
        status: 'scheduled',
        scheduledAt: at,
        sentAt: null,
        recipientCount: null,
        version: 1,
      },
    ],
  });
  mock('readOwnTickets', { data: [{ ...ticket, messages: undefined }], nextCursor: null });
  mock('readOwnTicket', ticket);
  mock('readOwnAdmin', {
    userId: ids.item,
    fullName: 'Ali',
    isRoot: false,
    status: 'invited',
    roles: ['support'],
  });
  for (const name of [
    'inviteAdmin',
    'changeAdmin',
    'decideVerification',
    'moderateReview',
    'dismissReviewReport',
    'actOnSupportTicket',
    'createAnnouncement',
    'cancelAnnouncement',
    'openSupportTicket',
    'replyOwnTicket',
    'acceptAdminInvitation',
  ])
    mock(name, {});
});
afterEach(cleanup);
it('OWN-001..004 / RPT: owner totals, actions required, deferred subscription, reports and analytics', async () => {
  show(<OwnerDashboard actorId="o" />);
  expect(await screen.findByText(/Active residents 6/)).toBeDefined();
  expect(screen.getByText(/outstanding PKR 36,000/)).toBeDefined();
  expect(screen.getByText('Payment proofs to verify: 2')).toBeDefined();
  expect(screen.getByText('Not active yet (deferred)')).toBeDefined();
  expect(screen.getAllByRole('link', { name: 'CSV' })[0]?.getAttribute('href')).toBe(
    '/api/v1/owner/reports/occupancy?format=csv',
  );
  fireEvent.change(screen.getByLabelText('Dashboard branch'), { target: { value: ids.branch } });
  await waitFor(() =>
    expect(vi.mocked(sdk.readOwnerDashboard).mock.calls.at(-1)?.[1]).toEqual({
      branchId: ids.branch,
    }),
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Show booking analytics' }));
  expect(await screen.findByText(/Listing views and searches are not collected/)).toBeDefined();
  expect(screen.getByText(/requests 2 · confirmed 1/)).toBeDefined();
});
it('MGRD-001..005: branch dashboard without money; branch-scoped report links', async () => {
  show(
    <>
      <BranchDashboard actorId="m" branchId={ids.branch} />
      <ReportDownloads branchId={ids.branch} />
    </>,
  );
  expect(await screen.findByText(/Move-ins 1 · Checkouts 0 · Visits 2/)).toBeDefined();
  expect(screen.queryByText(/Rent this month/)).toBeNull();
  fireEvent.change(screen.getByLabelText('Report from'), { target: { value: '2026-10-01' } });
  expect(screen.getAllByRole('link', { name: 'PDF' })[1]?.getAttribute('href')).toBe(
    `/api/v1/branches/${ids.branch}/reports/residents?format=pdf&from=2026-10-01`,
  );
});
it('ADM-001..010: role-gated sections act through the SDK with reasons', async () => {
  show(<AdminConsole actorId="r" admin={{ isRoot: true, roles: [] }} />);
  fireEvent.change(await screen.findByLabelText('Invite admin email'), {
    target: { value: 'new@x.test' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Invite admin' }));
  await waitFor(() => expect(sdk.inviteAdmin).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: 'Suspend Sara' }));
  fireEvent.change(screen.getByLabelText('Admin change reason for Sara'), {
    target: { value: 'Suspended during policy investigation' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Review admin change' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm admin change' }));
  await waitFor(() => expect(sdk.changeAdmin).toHaveBeenCalled());
  fireEvent.click(await screen.findByRole('button', { name: 'Review G-9 Girls · submitted' }));
  await screen.findByText('G-9 Girls dossier');
  fireEvent.change(screen.getByLabelText('Verification action'), { target: { value: 'approve' } });
  expect(
    (screen.getByRole('button', { name: 'Review verification decision' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.change(screen.getByLabelText('Verification reason'), {
    target: { value: 'Evidence reviewed' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Review verification decision' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm verification decision' }));
  await waitFor(() => expect(sdk.submitVerificationDecision).toHaveBeenCalled());
  fireEvent.click(await screen.findByRole('button', { name: 'Review reported content' }));
  await screen.findByText('Current review · published');
  fireEvent.change(screen.getByLabelText('Review moderation action'), {
    target: { value: 'hide' },
  });
  fireEvent.change(screen.getByLabelText('Policy reason'), { target: { value: 'Spam link' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Review moderation decision' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm moderation decision' }));
  await waitFor(() =>
    expect(vi.mocked(sdk.moderateReview).mock.calls[0]?.[2]).toMatchObject({
      action: 'hide',
      reason: 'Spam link',
      reportId: ids.item,
    }),
  );
  fireEvent.click(await screen.findByRole('button', { name: /OTP · normal/ }));
  fireEvent.change(await screen.findByLabelText('Support reply'), {
    target: { value: 'Fixed now' },
  });
  fireEvent.click(screen.getByLabelText('Internal staff note'));
  fireEvent.click(screen.getByRole('button', { name: 'Review support update' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm support update' }));
  await waitFor(() =>
    expect(vi.mocked(sdk.actOnSupportTicket).mock.calls[0]?.[2]).toMatchObject({ internal: true }),
  );
  fireEvent.change(screen.getByLabelText('Announcement title'), { target: { value: 'Hello' } });
  fireEvent.change(screen.getByLabelText('Announcement body'), { target: { value: 'Welcome' } });
  fireEvent.click(screen.getByRole('button', { name: 'Preview announcement' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm schedule announcement' }));
  await waitFor(() => expect(sdk.createAnnouncement).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: 'Cancel Maintenance' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm cancel announcement' }));
  await waitFor(() => expect(sdk.cancelAnnouncement).toHaveBeenCalled());
  cleanup();
  show(<AdminConsole actorId="v" admin={{ isRoot: false, roles: ['verification'] }} />);
  expect(await screen.findByRole('region', { name: 'Hostel verification' })).toBeDefined();
  expect(screen.queryByText('Administrators')).toBeNull();
  expect(screen.queryByText('Reported reviews')).toBeNull();
}, 15000);
it('ADM-002/009: users open and answer tickets; invited admins accept', async () => {
  show(
    <>
      <AdminInvitation actorId="u" />
      <HelpSupport actorId="u" />
    </>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Accept admin invitation' }));
  await waitFor(() => expect(sdk.acceptAdminInvitation).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: 'Help & Support' }));
  fireEvent.click(await screen.findByRole('button', { name: /OTP: Waiting for your reply/ }));
  expect(await screen.findByText('HSM support: Try again')).toBeDefined();
  fireEvent.change(screen.getByLabelText('Your reply'), { target: { value: 'Still failing' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
  await waitFor(() => expect(sdk.replyOwnTicket).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText('Ticket subject'), { target: { value: 'Listing' } });
  fireEvent.change(screen.getByLabelText('Describe the problem'), {
    target: { value: 'Photos missing' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Open ticket' }));
  await waitFor(() => expect(sdk.openSupportTicket).toHaveBeenCalled());
});

it('ADM-001: Web follows bounded Admin continuation without hiding later accounts', async () => {
  vi.mocked(sdk.listAdmins)
    .mockResolvedValueOnce({
      data: [
        {
          userId: ids.item,
          fullName: 'First admin',
          isRoot: false,
          status: 'active',
          roles: ['support'],
        },
      ],
      nextCursor: ids.item,
    })
    .mockResolvedValueOnce({
      data: [
        {
          userId: ids.branch,
          fullName: 'Later admin',
          isRoot: false,
          status: 'active',
          roles: ['verification'],
        },
      ],
      nextCursor: null,
    });
  show(<AdminConsole actorId="paging-root" admin={{ isRoot: true, roles: [] }} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Load more Admins' }));
  expect(await screen.findByRole('button', { name: 'Suspend Later admin' })).toBeDefined();
  expect(vi.mocked(sdk.listAdmins).mock.calls[1]?.[1]).toMatchObject({
    cursor: ids.item,
    limit: 50,
  });
  expect(screen.queryByRole('button', { name: 'Load more Admins' })).toBeNull();
});
