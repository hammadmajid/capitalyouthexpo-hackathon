import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import * as sdk from '@hsm/api-client';
import { NativeResidentServices } from './resident';
import { NativeBranchServices, NativePublicServices } from './staff';
jest.mock('../../lib/runtime', () => ({ client: {}, actorClient: async () => ({}) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'ffffffff-ffff-4fff-8fff-ffffffffffff' }));
jest.mock('../private-file-picker', () => ({ PrivateFilePicker: () => null }));
jest.mock('@hsm/api-client', () => {
  const actual = jest.requireActual('@hsm/api-client');
  const names = [
    'readStayMenu',
    'readStayRoutes',
    'readStayTransport',
    'requestTransport',
    'residentTransportAction',
    'readOwnComplaints',
    'readOwnComplaint',
    'createComplaint',
    'residentComplaintAction',
    'readReviewEligibility',
    'createReview',
    'readBranchMenu',
    'updateBranchMenu',
    'readBranchTransport',
    'decideTransport',
    'readBranchComplaints',
    'readBranchComplaint',
    'staffComplaintAction',
    'readBranchReviews',
    'replyToReview',
    'readPublicMenu',
    'readPublicRoutes',
    'readPublicReviews',
  ];
  return { ...actual, ...Object.fromEntries(names.map((name) => [name, jest.fn()])) };
});
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
  version: 1,
  updatedAt: at,
  items: [{ dayOfWeek: 1, meal: 'lunch', description: 'Daal Chawal' }],
};
const route = {
  id: ids.item,
  branchId: ids.branch,
  name: 'Shuttle',
  description: null,
  monthlyChargePaisa: 310000,
  departureTimes: ['07:30'],
  stops: ['A'],
  status: 'active',
  version: 1,
  pricingMode: 'separate',
  includedFrom: null,
  destinations: [],
  stopPoints: [{ name: 'A', role: 'both' }],
  trips: [],
  residentInclusion: null,
};
const sub = {
  id: ids.item,
  branchId: ids.branch,
  stayId: ids.stay,
  routeId: ids.item,
  routeName: 'Shuttle',
  status: 'requested',
  monthlyChargePaisa: 310000,
  effectiveFrom: null,
  effectiveTo: null,
  endRequestedAt: null,
  reason: null,
  version: 1,
  createdAt: at,
};
const complaint = (status: string) => ({
  id: ids.item,
  branchId: ids.branch,
  stayId: ids.stay,
  category: 'wifi',
  title: 'No Wi-Fi',
  description: 'Router down',
  status,
  roomLabel: null,
  bedLabel: null,
  residentName: 'Ali',
  assignedToName: null,
  reopenCount: 0,
  attachmentFileIds: [],
  version: 2,
  createdAt: at,
  resolvedAt: null,
  closedAt: null,
  events: [
    {
      id: ids.item,
      actorRole: 'owner',
      actorName: 'Owner',
      fromStatus: 'in_progress',
      toStatus: 'resolved',
      note: 'Fixed',
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
async function show(node: ReactNode) {
  await render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>,
  );
}
const mock = (name: keyof typeof sdk, value: unknown) =>
  jest.mocked(sdk[name] as jest.Mock).mockResolvedValue(value);
beforeEach(() => {
  jest.clearAllMocks();
  mock('readStayMenu', menu);
  mock('readBranchMenu', menu);
  mock('readPublicMenu', menu);
  mock('readStayRoutes', {
    branchId: ids.branch,
    data: [route],
    offer: { mode: 'separate', monthlyChargePaisa: 310000 },
  });
  mock('readPublicRoutes', { branchId: ids.branch, data: [route] });
  mock('readStayTransport', { data: [], nextCursor: null });
  mock('readBranchTransport', { data: [sub], nextCursor: null });
  mock('readOwnComplaints', { data: [complaint('resolved')], nextCursor: null });
  mock('readOwnComplaint', complaint('resolved'));
  mock('readBranchComplaints', { data: [complaint('open')], nextCursor: null });
  mock('readBranchComplaint', complaint('open'));
  mock('readReviewEligibility', {
    stayId: ids.stay,
    eligible: true,
    eligibleFrom: '2026-07-25',
    reason: 'eligible',
    reviewId: null,
  });
  mock('readBranchReviews', { data: [review], nextCursor: null });
  mock('readPublicReviews', {
    branchId: ids.branch,
    summary: { count: 1, averages: ratings },
    data: [{ ...review, verifiedStay: true }],
    nextCursor: null,
  });
  for (const name of [
    'requestTransport',
    'createComplaint',
    'residentComplaintAction',
    'createReview',
    'updateBranchMenu',
    'decideTransport',
    'staffComplaintAction',
    'replyToReview',
  ] as const)
    mock(name, {});
});
it('SERV / CMP / REV: resident requests transport, confirms a fix, raises a complaint and reviews', async () => {
  await show(<NativeResidentServices actorId="a" stayId={ids.stay} closed={false} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Hostel services' }));
  // The menu opens on today; Monday holds the fixture lunch.
  await fireEvent.press(await screen.findByRole('button', { name: 'Mon' }));
  expect(await screen.findByText(/Daal Chawal/)).toBeTruthy();
  // CHG-042: the resident sees the exact monthly price and confirms it before asking.
  await fireEvent.press(await screen.findByRole('button', { name: 'Subscribe — PKR 3,100/month' }));
  expect(screen.getByText(/billed separately from rent/)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(sdk.requestTransport).toHaveBeenCalled());
  // CHG-042: the paid route the resident rides is recorded with the branch fee.
  expect(jest.mocked(sdk.requestTransport).mock.calls[0]?.[2]).toEqual({
    monthlyChargePaisa: 310000,
    routeId: ids.item,
  });
  await fireEvent.press(await screen.findByRole('button', { name: /No Wi-Fi: Resolved/ }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Confirm it is fixed' }));
  await waitFor(() => expect(sdk.residentComplaintAction).toHaveBeenCalled());
  await fireEvent.changeText(screen.getByLabelText('Complaint title'), 'Leak');
  await fireEvent.changeText(screen.getByLabelText('Describe the problem'), 'Tap leaks');
  await fireEvent.press(screen.getByRole('button', { name: 'Send complaint' }));
  await waitFor(() => expect(sdk.createComplaint).toHaveBeenCalled());
  for (const key of Object.keys(ratings))
    await fireEvent.press(screen.getByRole('button', { name: key + ' 5' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Publish review' }));
  await waitFor(() => expect(sdk.createReview).toHaveBeenCalled());
});
it('CMP-006 / REV-002: past Stays cannot raise complaints; early reviews show the date', async () => {
  mock('readReviewEligibility', {
    stayId: ids.stay,
    eligible: false,
    eligibleFrom: '2026-07-25',
    reason: 'too_early',
    reviewId: null,
  });
  await show(<NativeResidentServices actorId="a" stayId={ids.stay} closed />);
  await fireEvent.press(screen.getByRole('button', { name: 'Hostel services' }));
  expect(await screen.findByText('New complaints cannot be raised for a past Stay.')).toBeTruthy();
  expect(await screen.findByText(/from 2026-07-25/)).toBeTruthy();
});
it('MGRD / SERV / CMP-005 / REV-005: staff save menu, resolve and reply (transport has its own tab)', async () => {
  await show(<NativeBranchServices actorId="u" branchId={ids.branch} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Menu, complaints and reviews' }));
  await fireEvent.changeText(await screen.findByLabelText('Tue dinner'), 'Biryani');
  await fireEvent.press(screen.getByRole('button', { name: 'Save menu' }));
  await waitFor(() => expect(sdk.updateBranchMenu).toHaveBeenCalled());
  await fireEvent.press(await screen.findByRole('button', { name: /Ali · No Wi-Fi: Open/ }));
  await fireEvent.changeText(await screen.findByLabelText('Resolution note'), 'Router replaced');
  await fireEvent.press(screen.getByRole('button', { name: 'Mark resolved' }));
  await waitFor(() => expect(sdk.staffComplaintAction).toHaveBeenCalled());
  await fireEvent.changeText(await screen.findByLabelText('Reply to Ali'), 'Thanks');
  await fireEvent.press(screen.getByRole('button', { name: 'Post public reply' }));
  await waitFor(() => expect(sdk.replyToReview).toHaveBeenCalled());
});
it('BR-05: public listing shows optional transport and verified reviews (menu is PublicFood)', async () => {
  await show(<NativePublicServices branchId={ids.branch} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Transport and reviews' }));
  // CHG-049: one "available at" list; an older route without places shows by its name.
  expect(await screen.findByText('Transport available at')).toBeTruthy();
  expect(screen.getByText('Shuttle')).toBeTruthy();
  expect(await screen.findByText(/Ali · Verified Stay · 4\/5/)).toBeTruthy();
});

it('UI-001: Complaints tab opens only the complaint queue without menu or reviews', async () => {
  await show(<NativeBranchServices actorId="owner" branchId={ids.branch} complaintsOnly />);
  expect(await screen.findByRole('button', { name: /Ali.*No Wi-Fi/ })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Menu, complaints and reviews' })).toBeNull();
  expect(screen.queryByLabelText('Menu editor')).toBeNull();
  expect(screen.queryByLabelText('Reviews')).toBeNull();
  expect(sdk.readBranchMenu).not.toHaveBeenCalled();
  expect(sdk.readBranchReviews).not.toHaveBeenCalled();
});

it('UI-001: an empty Complaints tab shows its own empty state', async () => {
  mock('readBranchComplaints', { data: [], nextCursor: null });
  await show(<NativeBranchServices actorId="owner" branchId={ids.branch} complaintsOnly />);
  expect(await screen.findByText('No complaints')).toBeTruthy();
  expect(sdk.readBranchMenu).not.toHaveBeenCalled();
  expect(sdk.readBranchReviews).not.toHaveBeenCalled();
});
