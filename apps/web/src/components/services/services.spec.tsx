import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import * as sdk from '@hsm/api-client';
import { BranchServicesPanel, PublicServices, ResidentServicesPanel } from './panels';
import { TransportRoutesSetup } from './transport-routes-setup';
vi.mock('@hsm/api-client', async (original) => {
  const actual = await original<typeof import('@hsm/api-client')>();
  const mocked = Object.fromEntries(
    [
      'readPublicMenu',
      'readPublicRoutes',
      'readStayMenu',
      'readBranchMenu',
      'updateBranchMenu',
      'readStayRoutes',
      'readStayTransport',
      'requestTransport',
      'residentTransportAction',
      'readBranchRoutes',
      'readBranchTransport',
      'readInventoryAccess',
      'readTransportOverview',
      'createTransportRoute',
      'updateTransportRoute',
      'decideTransport',
      'readOwnComplaints',
      'readOwnComplaint',
      'createComplaint',
      'residentComplaintAction',
      'readBranchComplaints',
      'readBranchComplaint',
      'readComplaintStats',
      'staffComplaintAction',
      'readReviewEligibility',
      'readOwnReview',
      'createReview',
      'readBranchReviews',
      'replyToReview',
      'readPublicReviews',
      'uploadPrivateFile',
      'waitForCleanFile',
    ].map((name) => [name, vi.fn()]),
  );
  return { ...actual, ...mocked };
});
vi.mock('../../lib/client', () => ({ browserClient: () => ({}) }));
const ids = {
  branch: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  stay: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  item: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
};
const at = '2026-10-26T10:00:00.000Z';
const ratings = {
  cleanliness: 4,
  security: 4,
  food: 4,
  staff: 4,
  wifi: 4,
  facilities: 4,
  location: 4,
  value: 4,
  overall: 4,
};
const menu = {
  branchId: ids.branch,
  version: 2,
  updatedAt: at,
  items: [{ dayOfWeek: 1, meal: 'lunch' as const, description: 'Daal Chawal' }],
};
const route = {
  id: ids.item,
  branchId: ids.branch,
  name: 'F-6 Shuttle',
  description: null,
  monthlyChargePaisa: 310000,
  departureTimes: ['07:30'],
  stops: ['F-6', 'NUST'],
  status: 'active' as const,
  version: 1,
  pricingMode: 'separate' as const,
  includedFrom: null,
  destinations: [],
  stopPoints: [],
  trips: [],
};
const sub = (status: string, change: Record<string, unknown> = {}) => ({
  id: ids.item,
  branchId: ids.branch,
  stayId: ids.stay,
  routeId: ids.item,
  routeName: 'F-6 Shuttle',
  status,
  monthlyChargePaisa: 310000,
  effectiveFrom: null,
  effectiveTo: null,
  endRequestedAt: null,
  reason: null,
  version: 1,
  createdAt: at,
  ...change,
});
const complaint = (status: string) => ({
  id: ids.item,
  branchId: ids.branch,
  stayId: ids.stay,
  category: 'wifi',
  title: 'No Wi-Fi',
  description: 'Router down',
  status,
  roomLabel: '101',
  bedLabel: 'A',
  residentName: 'Ali',
  assignedToName: null,
  reopenCount: 0,
  attachmentFileIds: [],
  version: 3,
  createdAt: at,
  resolvedAt: null,
  closedAt: null,
  events: [
    {
      id: ids.item,
      actorRole: 'resident',
      actorName: 'Ali',
      fromStatus: null,
      toStatus: 'open',
      note: null,
      createdAt: at,
    },
  ],
});
const review = {
  id: ids.item,
  reviewerName: 'Ali',
  ratings,
  body: 'Clean',
  createdAt: at,
  editedAt: null,
  reply: null,
  status: 'published',
  moderationReason: null,
  version: 1,
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
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(sdk.readInventoryAccess).mockResolvedValue({
    branchId: ids.branch,
    permissions: ['listing_edit', 'pricing_edit', 'finance_view', 'stay_manage', 'rent_manage'],
    canConfigureManagers: true,
  });
  vi.mocked(sdk.readTransportOverview).mockResolvedValue({
    branchId: ids.branch,
    activeRoutes: 1,
    inactiveRoutes: 0,
    destinations: 1,
    includedRoutes: 0,
    paidRoutes: 1,
    activeSubscribers: 1,
    pendingRequests: 1,
    monthlyChargesPaisa: 400000,
    tripsToday: 1,
  });
  vi.mocked(sdk.readStayMenu).mockResolvedValue(menu as never);
  vi.mocked(sdk.readBranchMenu).mockResolvedValue(menu as never);
  vi.mocked(sdk.readPublicMenu).mockResolvedValue(menu as never);
  vi.mocked(sdk.readStayRoutes).mockResolvedValue({
    branchId: ids.branch,
    data: [route],
    offer: { mode: 'separate', monthlyChargePaisa: 310000 },
  } as never);
  vi.mocked(sdk.readPublicRoutes).mockResolvedValue({
    branchId: ids.branch,
    data: [route],
    // CHG-046: the separate monthly fee is published once for the branch.
    offer: { mode: 'separate', monthlyChargePaisa: 310000 },
  } as never);
  vi.mocked(sdk.readBranchRoutes).mockResolvedValue({
    branchId: ids.branch,
    data: [route],
  } as never);
  vi.mocked(sdk.readStayTransport).mockResolvedValue({ data: [], nextCursor: null } as never);
  vi.mocked(sdk.readBranchTransport).mockResolvedValue({
    data: [
      sub('requested'),
      sub('active', { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', effectiveFrom: '2026-07-10' }),
    ],
    nextCursor: null,
  } as never);
  vi.mocked(sdk.readOwnComplaints).mockResolvedValue({
    data: [complaint('resolved')],
    nextCursor: null,
  } as never);
  vi.mocked(sdk.readOwnComplaint).mockResolvedValue(complaint('resolved') as never);
  vi.mocked(sdk.readBranchComplaints).mockResolvedValue({
    data: [complaint('open')],
    nextCursor: null,
  } as never);
  vi.mocked(sdk.readBranchComplaint).mockResolvedValue(complaint('open') as never);
  vi.mocked(sdk.readComplaintStats).mockResolvedValue({
    branchId: ids.branch,
    counts: { open: 1, assigned: 0, in_progress: 0, resolved: 0, reopened: 0, closed: 0 },
    resolvedCount: 0,
    averageResolutionHours: null,
  } as never);
  vi.mocked(sdk.readReviewEligibility).mockResolvedValue({
    stayId: ids.stay,
    eligible: true,
    eligibleFrom: '2026-07-25',
    reason: 'eligible',
    reviewId: null,
  } as never);
  vi.mocked(sdk.readBranchReviews).mockResolvedValue({ data: [review], nextCursor: null } as never);
  vi.mocked(sdk.readPublicReviews).mockResolvedValue({
    branchId: ids.branch,
    summary: { count: 1, averages: ratings },
    data: [{ ...review, verifiedStay: true }],
    nextCursor: null,
  } as never);
  for (const name of [
    'requestTransport',
    'createComplaint',
    'residentComplaintAction',
    'createReview',
    'updateBranchMenu',
    'createTransportRoute',
    'decideTransport',
    'staffComplaintAction',
    'replyToReview',
  ] as const)
    vi.mocked(sdk[name]).mockResolvedValue({} as never);
});
afterEach(cleanup);
it('SERV / CMP / REV: the resident menu, transport request, complaint actions and review form', async () => {
  show(<ResidentServicesPanel actorId="a" stayId={ids.stay} closed={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Hostel services' }));
  expect(await screen.findByText('Daal Chawal')).toBeDefined();
  expect(await screen.findByText(/PKR 3,100 per month, billed separately from rent/)).toBeDefined();
  fireEvent.click(await screen.findByRole('button', { name: 'Request transport' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm PKR 3,100/month' }));
  await waitFor(() => expect(sdk.requestTransport).toHaveBeenCalled());
  expect(vi.mocked(sdk.requestTransport).mock.calls[0]?.[2]).toEqual({
    monthlyChargePaisa: 310000,
  });
  fireEvent.click(await screen.findByRole('button', { name: /No Wi-Fi: Resolved/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm it is fixed' }));
  await waitFor(() => expect(sdk.residentComplaintAction).toHaveBeenCalled());
  expect(vi.mocked(sdk.residentComplaintAction).mock.calls[0]?.[3]).toEqual({
    action: 'accept',
    expectedVersion: 3,
  });
  fireEvent.change(screen.getByLabelText('Why it is not fixed'), {
    target: { value: 'Still down' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Reopen complaint' }));
  await waitFor(() => expect(sdk.residentComplaintAction).toHaveBeenCalledTimes(2));
  fireEvent.change(screen.getByLabelText('Complaint title'), { target: { value: 'Leak' } });
  fireEvent.change(screen.getByLabelText('Describe the problem'), {
    target: { value: 'Tap leaks' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send complaint' }));
  await waitFor(() => expect(sdk.createComplaint).toHaveBeenCalled());
  const publish = screen.getByRole('button', { name: 'Publish review' }) as HTMLButtonElement;
  expect(publish.disabled).toBe(true);
  for (const label of [
    'Cleanliness',
    'Security',
    'Food',
    'Staff behaviour',
    'Wi-Fi',
    'Facilities',
    'Location',
    'Value for money',
    'Overall',
  ])
    fireEvent.change(screen.getByLabelText('Rating for ' + label), { target: { value: '5' } });
  fireEvent.click(publish);
  await waitFor(() => expect(sdk.createReview).toHaveBeenCalled());
});
it('CMP-006 / REV-002: a past Stay cannot raise complaints; too-early reviews show the date', async () => {
  vi.mocked(sdk.readReviewEligibility).mockResolvedValue({
    stayId: ids.stay,
    eligible: false,
    eligibleFrom: '2026-07-25',
    reason: 'too_early',
    reviewId: null,
  } as never);
  vi.mocked(sdk.readStayTransport).mockResolvedValue({
    data: [sub('active', { effectiveFrom: '2026-07-10' })],
    nextCursor: null,
  } as never);
  show(<ResidentServicesPanel actorId="a" stayId={ids.stay} closed />);
  fireEvent.click(screen.getByRole('button', { name: 'Hostel services' }));
  expect(await screen.findByText('New complaints cannot be raised for a past Stay.')).toBeDefined();
  expect(await screen.findByText(/from 2026-07-25 \(after 30 days of stay\)/)).toBeDefined();
  expect(await screen.findByText(/Active · PKR 3,100\/month · from 2026-07-10/)).toBeDefined();
  expect(screen.queryByRole('button', { name: 'Ask to stop transport' })).toBeNull();
});
it('SERV / CMP-005 / REV-005: staff save the menu, decide transport, resolve complaints and reply', async () => {
  show(<BranchServicesPanel actorId="u" branchId={ids.branch} />);
  fireEvent.click(screen.getByRole('button', { name: /Manage menu, transport/ }));
  fireEvent.change(await screen.findByLabelText('Tue Dinner'), { target: { value: 'Biryani' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save menu' }));
  await waitFor(() => expect(sdk.updateBranchMenu).toHaveBeenCalled());
  expect(vi.mocked(sdk.updateBranchMenu).mock.calls[0]?.[2]).toMatchObject({
    expectedVersion: 2,
    items: expect.arrayContaining([{ dayOfWeek: 2, meal: 'dinner', description: 'Biryani' }]),
  });
  // CHG-061: Operations has no route editors; routes are set up in Hostel Setup.
  expect(await screen.findByText(/transport subscribers/)).toBeDefined();
  expect(screen.queryByRole('button', { name: 'Edit ' + route.name })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Add route' })).toBeNull();
  fireEvent.change(screen.getByLabelText('Transport effective date'), {
    target: { value: '2026-11-01' },
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Approve transport from date' }));
  await waitFor(() => expect(sdk.decideTransport).toHaveBeenCalled());
  expect(vi.mocked(sdk.decideTransport).mock.calls[0]?.[3]).toEqual({
    decision: 'approve',
    expectedVersion: 1,
    effectiveFrom: '2026-11-01',
  });
  fireEvent.click(await screen.findByRole('button', { name: 'End transport on date' }));
  await waitFor(() => expect(sdk.decideTransport).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Decline transport request' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Decline transport request' }));
  await waitFor(() => expect(sdk.decideTransport).toHaveBeenCalledTimes(3));
  fireEvent.click(await screen.findByRole('button', { name: /Ali · No Wi-Fi: Open/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Assign to me' }));
  await waitFor(() => expect(sdk.staffComplaintAction).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect((screen.getByRole('button', { name: 'Start work' }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Start work' }));
  await waitFor(() => expect(sdk.staffComplaintAction).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Mark resolved' }) as HTMLButtonElement).disabled,
    ).toBe(true),
  );
  fireEvent.change(screen.getByLabelText('Complaint note'), {
    target: { value: 'Router replaced' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Mark resolved' }));
  await waitFor(() => expect(sdk.staffComplaintAction).toHaveBeenCalledTimes(3));
  expect(vi.mocked(sdk.staffComplaintAction).mock.calls[0]?.[3]).toEqual({
    action: 'assign',
    expectedVersion: 3,
    assigneeUserId: 'u',
  });
  expect(await screen.findByText(/Average resolution not yet measured/)).toBeDefined();
  fireEvent.change(screen.getByLabelText('Reply to Ali'), { target: { value: 'Thank you' } });
  fireEvent.click(screen.getByRole('button', { name: 'Post public reply' }));
  await waitFor(() => expect(sdk.replyToReview).toHaveBeenCalled());
});
it('BR-05: the public listing shows menu, optional transport price and verified reviews', async () => {
  show(<PublicServices branchId={ids.branch} />);
  expect(await screen.findByText('Daal Chawal')).toBeDefined();
  expect(await screen.findByText(/billed separately/)).toBeDefined();
  // CHG-049: one list of places; a route without places is listed by its own name.
  expect(screen.getByText('Transport available at')).toBeDefined();
  expect(screen.getByRole('listitem').textContent).toBe('F-6 Shuttle');
  expect(await screen.findByText(/Ali · Verified Stay · overall 4\/5/)).toBeDefined();
  expect(screen.getByText(/Cleanliness 4.0/)).toBeDefined();
  cleanup();
  vi.mocked(sdk.readPublicMenu).mockRejectedValue(new Error('x'));
  vi.mocked(sdk.readPublicRoutes).mockResolvedValue({ branchId: ids.branch, data: [] } as never);
  vi.mocked(sdk.readPublicReviews).mockRejectedValue(new Error('x'));
  show(<PublicServices branchId={ids.branch} />);
  expect(await screen.findByText('No transport offered.')).toBeDefined();
  expect(await screen.findByText('Reviews are not available right now.')).toBeDefined();
  expect(await screen.findByText('Menu not available.')).toBeDefined();
});
it('CHG-049 / CHG-061: Hostel Setup edits a route as a list of places', async () => {
  show(<TransportRoutesSetup actorId="u" branchId={ids.branch} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit ' + route.name }));
  expect(screen.queryByRole('button', { name: 'Add route' })).toBeNull();
  fireEvent.change(screen.getByLabelText('Route name (optional)'), {
    target: { value: 'G-9 Van' },
  });
  fireEvent.change(screen.getByLabelText('Search or type a place'), { target: { value: 'G-9' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add this place' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save route' }));
  await waitFor(() => expect(sdk.updateTransportRoute).toHaveBeenCalled());
  // CHG-046: routes are schedule-only; the monthly fee lives in the branch Billing Policy.
  const sent = vi.mocked(sdk.updateTransportRoute).mock.calls[0]?.[3];
  // CHG-049: saving clears old stops, timings and the description.
  expect(sent).toMatchObject({
    name: 'G-9 Van',
    status: 'active',
    stopPoints: [],
    trips: [],
    departureTimes: [],
    destinations: expect.arrayContaining([expect.objectContaining({ name: 'G-9' })]),
  });
  expect(sent).not.toHaveProperty('description');
  expect(sent).not.toHaveProperty('monthlyChargePaisa');
  expect(sdk.createTransportRoute).not.toHaveBeenCalled();
});
