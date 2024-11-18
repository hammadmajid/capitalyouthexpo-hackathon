import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import * as sdk from './platform-admin.js';
const ids = {
  branch: '10000000-0000-4000-8000-000000000001',
  item: '10000000-0000-4000-8000-000000000002',
  key: '10000000-0000-4000-8000-000000000003',
};
const at = '2026-10-26T10:00:00.000Z';
const admin = {
  userId: ids.item,
  fullName: 'S',
  isRoot: false,
  status: 'active',
  roles: ['support'],
};
const ticket = {
  id: ids.item,
  subject: 's',
  category: 'account',
  priority: 'normal',
  status: 'open',
  openedByName: 'A',
  assignedToName: null,
  version: 1,
  createdAt: at,
  updatedAt: at,
  messages: [],
};
const ticketRow = Object.fromEntries(Object.entries(ticket).filter(([key]) => key !== 'messages'));
const announcement = {
  id: ids.item,
  audience: 'customers',
  title: 't',
  body: 'b',
  status: 'scheduled',
  scheduledAt: at,
  sentAt: null,
  recipientCount: null,
  version: 1,
};
const zeros = { beds: 0, occupied: 0, available: 0, reserved: 0, blocked: 0, unavailable: 0 };
const rent = {
  month: '2026-10',
  invoices: 0,
  expectedPaisa: 0,
  collectedPaisa: 0,
  outstandingPaisa: 0,
  overdueInvoices: 0,
};
const actions = {
  pendingBookings: 0,
  pendingProofs: 0,
  openComplaints: 0,
  upcomingCheckouts: 0,
  overdueInvoices: 0,
};
const report = {
  type: 'residents',
  from: null,
  to: null,
  columns: ['a'],
  rows: [],
  truncated: false,
};
function fixture(data: unknown) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  return {
    fetch,
    client: createApiClient({
      baseUrl: 'https://api.example.test',
      authentication: { kind: 'bearer', accessToken: async () => 't' },
      fetch,
    }),
  };
}
type Case = [
  string,
  unknown,
  (client: ReturnType<typeof fixture>['client']) => Promise<unknown>,
  string,
  string,
];
const cases: Case[] = [
  [
    'list admins',
    { data: [admin], nextCursor: null },
    (c) => sdk.listAdmins(c),
    'GET',
    '/v1/admin/admins?limit=50',
  ],
  ['own admin', admin, (c) => sdk.readOwnAdmin(c), 'GET', '/v1/admin/me'],
  [
    'invite',
    admin,
    (c) => sdk.inviteAdmin(c, { email: 'a@b.test', roles: ['support'] }, ids.key),
    'POST',
    '/v1/admin/admins',
  ],
  ['accept', admin, (c) => sdk.acceptAdminInvitation(c, ids.key), 'POST', '/v1/admin/me/accept'],
  [
    'change',
    admin,
    (c) => sdk.changeAdmin(c, ids.item, { change: 'root', isRoot: true, reason: 'r' }, ids.key),
    'POST',
    `/v1/admin/admins/${ids.item}/changes`,
  ],
  [
    'verification queue',
    { data: [], nextCursor: null },
    (c) => sdk.readVerificationQueue(c, { cursor: ids.item }),
    'GET',
    `/v1/admin/verifications?status=submitted&limit=20&cursor=${ids.item}`,
  ],
  [
    'verify',
    {
      branchId: ids.branch,
      branchName: 'B',
      organizationName: 'O',
      status: 'approved',
      updatedAt: at,
    },
    (c) => sdk.decideVerification(c, ids.branch, { action: 'approve' }, ids.key),
    'POST',
    `/v1/admin/verifications/${ids.branch}`,
  ],
  [
    'review reports',
    { data: [], nextCursor: null },
    (c) => sdk.readReviewReports(c),
    'GET',
    '/v1/admin/review-reports',
  ],
  [
    'moderate',
    { reviewId: ids.item, status: 'hidden', version: 2 },
    (c) =>
      sdk.moderateReview(c, ids.item, { action: 'hide', expectedVersion: 1, reason: 'r' }, ids.key),
    'POST',
    `/v1/admin/reviews/${ids.item}/moderation`,
  ],
  [
    'dismiss',
    { reportId: ids.item, status: 'dismissed' },
    (c) => sdk.dismissReviewReport(c, ids.item, { reason: 'r' }, ids.key),
    'POST',
    `/v1/admin/review-reports/${ids.item}/dismiss`,
  ],
  [
    'open ticket',
    ticket,
    (c) => sdk.openSupportTicket(c, { subject: 's', category: 'account', body: 'b' }, ids.key),
    'POST',
    '/v1/support/tickets',
  ],
  [
    'own tickets',
    { data: [ticketRow], nextCursor: null },
    (c) => sdk.readOwnTickets(c, { status: 'open', cursor: ids.item }),
    'GET',
    `/v1/support/tickets?limit=20&status=open&cursor=${ids.item}`,
  ],
  [
    'own ticket',
    ticket,
    (c) => sdk.readOwnTicket(c, ids.item),
    'GET',
    `/v1/support/tickets/${ids.item}`,
  ],
  [
    'reply',
    ticket,
    (c) => sdk.replyOwnTicket(c, ids.item, { body: 'b' }, ids.key),
    'POST',
    `/v1/support/tickets/${ids.item}/replies`,
  ],
  [
    'queue',
    { data: [], nextCursor: null },
    (c) => sdk.readSupportQueue(c),
    'GET',
    '/v1/admin/support-tickets?limit=20',
  ],
  [
    'admin ticket',
    ticket,
    (c) => sdk.readSupportTicket(c, ids.item),
    'GET',
    `/v1/admin/support-tickets/${ids.item}`,
  ],
  [
    'act',
    ticket,
    (c) => sdk.actOnSupportTicket(c, ids.item, { expectedVersion: 1, status: 'resolved' }, ids.key),
    'POST',
    `/v1/admin/support-tickets/${ids.item}/actions`,
  ],
  [
    'announcements',
    { data: [announcement] },
    (c) => sdk.readAnnouncements(c),
    'GET',
    '/v1/admin/announcements',
  ],
  [
    'announce',
    announcement,
    (c) => sdk.createAnnouncement(c, { audience: 'customers', title: 't', body: 'b' }, ids.key),
    'POST',
    '/v1/admin/announcements',
  ],
  [
    'cancel',
    announcement,
    (c) => sdk.cancelAnnouncement(c, ids.item, ids.key),
    'POST',
    `/v1/admin/announcements/${ids.item}/cancel`,
  ],
  [
    'owner dashboard',
    {
      nextCursor: null,
      asOf: '2026-10-26',
      month: '2026-10',
      branches: [],
      totals: { beds: zeros, activeResidents: 0, confirmedBookings: 0, rent, actions },
    },
    (c) => sdk.readOwnerDashboard(c, { month: '2026-10' }),
    'GET',
    '/v1/owner/dashboard?month=2026-10',
  ],
  [
    'branch dashboard',
    {
      branchId: ids.branch,
      asOf: '2026-10-26',
      today: { moveIns: 0, checkouts: 0, visits: 0 },
      queue: actions,
      beds: zeros,
      unreadNotices: 0,
      rent: null,
    },
    (c) => sdk.readBranchDashboard(c, ids.branch),
    'GET',
    `/v1/branches/${ids.branch}/dashboard`,
  ],
  [
    'analytics',
    {
      from: '2026-10-01',
      to: '2026-10-31',
      branches: [],
      coverage: { listingViews: 'not_collected', searches: 'not_collected' },
    },
    (c) => sdk.readOwnerAnalytics(c, { from: '2026-10-01', to: '2026-10-31' }),
    'GET',
    '/v1/owner/analytics?from=2026-10-01&to=2026-10-31',
  ],
  [
    'owner report',
    report,
    (c) => sdk.readReport(c, 'residents', { from: '2026-10-01' }),
    'GET',
    '/v1/owner/reports/residents?from=2026-10-01',
  ],
  [
    'branch report',
    report,
    (c) => sdk.readReport(c, 'residents', { branchId: ids.branch }),
    'GET',
    `/v1/branches/${ids.branch}/reports/residents`,
  ],
];
it.each(cases)(
  'ADM / OWN / RPT: %s calls its exact route and parses the contract',
  async (_name, data, call, method, path) => {
    const value = fixture(data);
    await expect(call(value.client)).resolves.toEqual(data);
    const request = value.fetch.mock.calls[0]?.[0] as Request;
    expect(request.method).toBe(method);
    expect(request.url).toBe('https://api.example.test' + path);
    if (method !== 'GET') expect(request.headers.get('Idempotency-Key')).toBe(ids.key);
  },
);
it('RPT-001: download links name the format and scope; bad input never reaches the network', () => {
  expect(
    sdk.reportDownloadPath('complaints', 'csv', {
      branchId: ids.branch,
      from: '2026-10-01',
      to: '2026-10-31',
    }),
  ).toBe(`/v1/branches/${ids.branch}/reports/complaints?format=csv&from=2026-10-01&to=2026-10-31`);
  expect(sdk.reportDownloadPath('residents', 'pdf')).toBe('/v1/owner/reports/residents?format=pdf');
  expect(() => sdk.reportDownloadPath('salaries', 'csv')).toThrow();
  expect(() => sdk.inviteAdmin(fixture({}).client, { email: 'x', roles: [] }, ids.key)).toThrow();
});
