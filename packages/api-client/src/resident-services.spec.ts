import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import * as sdk from './resident-services.js';
const ids = {
  branch: '10000000-0000-4000-8000-000000000001',
  stay: '10000000-0000-4000-8000-000000000002',
  item: '10000000-0000-4000-8000-000000000003',
  key: '10000000-0000-4000-8000-000000000004',
  other: '10000000-0000-4000-8000-000000000005',
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
  items: [{ dayOfWeek: 1, meal: 'lunch', description: 'Daal' }],
  times: [{ dayOfWeek: 1, meal: 'lunch' as const, startsAt: '13:00', endsAt: '14:30' }],
};
const route = {
  id: ids.item,
  branchId: ids.branch,
  name: 'R',
  description: null,
  monthlyChargePaisa: 100,
  departureTimes: ['07:00'],
  stops: ['A'],
  status: 'active',
  version: 1,
  pricingMode: 'separate',
  includedFrom: null,
  destinations: [],
  stopPoints: [{ name: 'A', role: 'both' }],
  trips: [],
};
const routes = { branchId: ids.branch, data: [route] };
const subscription = {
  id: ids.item,
  branchId: ids.branch,
  stayId: ids.stay,
  routeId: ids.item,
  routeName: 'R',
  status: 'requested',
  monthlyChargePaisa: 100,
  effectiveFrom: null,
  effectiveTo: null,
  endRequestedAt: null,
  reason: null,
  version: 1,
  createdAt: at,
};
const subscriptions = { data: [subscription], nextCursor: null };
const complaint = {
  id: ids.item,
  branchId: ids.branch,
  stayId: ids.stay,
  category: 'wifi',
  title: 't',
  description: 'd',
  status: 'open',
  roomLabel: null,
  bedLabel: null,
  residentName: 'R',
  assignedToName: null,
  reopenCount: 0,
  attachmentFileIds: [],
  version: 1,
  createdAt: at,
  resolvedAt: null,
  closedAt: null,
};
const detail = { ...complaint, events: [] };
const complaints = { data: [complaint], nextCursor: null };
const stats = {
  branchId: ids.branch,
  counts: { open: 1, assigned: 0, in_progress: 0, resolved: 0, reopened: 0, closed: 0 },
  resolvedCount: 0,
  averageResolutionHours: null,
};
const review = {
  id: ids.item,
  reviewerName: 'Ali',
  ratings,
  body: null,
  createdAt: at,
  editedAt: null,
  reply: null,
};
const own = {
  ...review,
  stayId: ids.stay,
  status: 'published',
  moderationReason: null,
  version: 1,
};
const staff = { ...review, status: 'published', moderationReason: null, version: 1 };
const eligibility = {
  stayId: ids.stay,
  eligible: true,
  eligibleFrom: '2026-07-25',
  reason: 'eligible',
  reviewId: null,
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
    'public menu',
    menu,
    (c) => sdk.readPublicMenu(c, ids.branch),
    'GET',
    `/v1/public/branches/${ids.branch}/menu`,
  ],
  ['stay menu', menu, (c) => sdk.readStayMenu(c, ids.stay), 'GET', `/v1/me/stays/${ids.stay}/menu`],
  [
    'branch menu',
    menu,
    (c) => sdk.readBranchMenu(c, ids.branch),
    'GET',
    `/v1/branches/${ids.branch}/menu`,
  ],
  [
    'update menu',
    menu,
    (c) => sdk.updateBranchMenu(c, ids.branch, { expectedVersion: 0, items: menu.items }, ids.key),
    'PUT',
    `/v1/branches/${ids.branch}/menu`,
  ],
  [
    'public routes',
    routes,
    (c) => sdk.readPublicRoutes(c, ids.branch),
    'GET',
    `/v1/public/branches/${ids.branch}/transport/routes`,
  ],
  [
    'stay routes',
    routes,
    (c) => sdk.readStayRoutes(c, ids.stay),
    'GET',
    `/v1/me/stays/${ids.stay}/transport/routes`,
  ],
  [
    'branch routes',
    routes,
    (c) => sdk.readBranchRoutes(c, ids.branch),
    'GET',
    `/v1/branches/${ids.branch}/transport/routes`,
  ],
  [
    'create route',
    route,
    (c) =>
      sdk.createTransportRoute(
        c,
        ids.branch,
        { name: 'R', monthlyChargePaisa: 100, departureTimes: ['07:00'], stops: ['A'] },
        ids.key,
      ),
    'POST',
    `/v1/branches/${ids.branch}/transport/routes`,
  ],
  [
    'update route',
    route,
    (c) =>
      sdk.updateTransportRoute(
        c,
        ids.branch,
        ids.item,
        {
          name: 'R',
          monthlyChargePaisa: 100,
          departureTimes: ['07:00'],
          stops: ['A'],
          expectedVersion: 1,
          status: 'inactive',
        },
        ids.key,
      ),
    'PUT',
    `/v1/branches/${ids.branch}/transport/routes/${ids.item}`,
  ],
  [
    'own transport',
    subscriptions,
    (c) => sdk.readStayTransport(c, ids.stay),
    'GET',
    `/v1/me/stays/${ids.stay}/transport/subscriptions`,
  ],
  [
    'request transport',
    subscription,
    (c) =>
      sdk.requestTransport(c, ids.stay, { routeId: ids.item, monthlyChargePaisa: 100 }, ids.key),
    'POST',
    `/v1/me/stays/${ids.stay}/transport/subscriptions`,
  ],
  [
    'withdraw',
    subscription,
    (c) =>
      sdk.residentTransportAction(
        c,
        ids.stay,
        ids.item,
        'withdraw',
        { expectedVersion: 1 },
        ids.key,
      ),
    'POST',
    `/v1/me/stays/${ids.stay}/transport/subscriptions/${ids.item}/withdraw`,
  ],
  [
    'end',
    subscription,
    (c) =>
      sdk.residentTransportAction(c, ids.stay, ids.item, 'end', { expectedVersion: 1 }, ids.key),
    'POST',
    `/v1/me/stays/${ids.stay}/transport/subscriptions/${ids.item}/end`,
  ],
  [
    'branch transport',
    subscriptions,
    (c) => sdk.readBranchTransport(c, ids.branch, { status: 'requested', cursor: ids.other }),
    'GET',
    `/v1/branches/${ids.branch}/transport/subscriptions?limit=20&status=requested&cursor=${ids.other}`,
  ],
  [
    'decide',
    subscription,
    (c) =>
      sdk.decideTransport(
        c,
        ids.branch,
        ids.item,
        { decision: 'approve', expectedVersion: 1, effectiveFrom: '2026-11-01' },
        ids.key,
      ),
    'POST',
    `/v1/branches/${ids.branch}/transport/subscriptions/${ids.item}/decision`,
  ],
  [
    'create complaint',
    detail,
    (c) =>
      sdk.createComplaint(c, ids.stay, { category: 'wifi', title: 't', description: 'd' }, ids.key),
    'POST',
    `/v1/me/stays/${ids.stay}/complaints`,
  ],
  [
    'own complaints',
    complaints,
    (c) =>
      sdk.readOwnComplaints(c, ids.stay, { status: 'open', category: 'wifi', cursor: ids.other }),
    'GET',
    `/v1/me/stays/${ids.stay}/complaints?limit=20&status=open&category=wifi&cursor=${ids.other}`,
  ],
  [
    'own complaint',
    detail,
    (c) => sdk.readOwnComplaint(c, ids.stay, ids.item),
    'GET',
    `/v1/me/stays/${ids.stay}/complaints/${ids.item}`,
  ],
  [
    'resident action',
    detail,
    (c) =>
      sdk.residentComplaintAction(
        c,
        ids.stay,
        ids.item,
        { action: 'accept', expectedVersion: 1 },
        ids.key,
      ),
    'POST',
    `/v1/me/stays/${ids.stay}/complaints/${ids.item}/actions`,
  ],
  [
    'branch complaints',
    complaints,
    (c) => sdk.readBranchComplaints(c, ids.branch),
    'GET',
    `/v1/branches/${ids.branch}/complaints?limit=20`,
  ],
  [
    'branch complaint',
    detail,
    (c) => sdk.readBranchComplaint(c, ids.branch, ids.item),
    'GET',
    `/v1/branches/${ids.branch}/complaints/${ids.item}`,
  ],
  [
    'staff action',
    detail,
    (c) =>
      sdk.staffComplaintAction(
        c,
        ids.branch,
        ids.item,
        { action: 'start', expectedVersion: 1 },
        ids.key,
      ),
    'POST',
    `/v1/branches/${ids.branch}/complaints/${ids.item}/actions`,
  ],
  [
    'stats',
    stats,
    (c) => sdk.readComplaintStats(c, ids.branch),
    'GET',
    `/v1/branches/${ids.branch}/complaints-stats`,
  ],
  [
    'own attachment',
    { url: 'https://x.test/f', expiresAt: at },
    (c) => sdk.complaintAttachmentLink(c, ids.item, ids.other, { stay: ids.stay }),
    'GET',
    `/v1/me/stays/${ids.stay}/complaints/${ids.item}/attachments/${ids.other}`,
  ],
  [
    'staff attachment',
    { url: 'https://x.test/f', expiresAt: at },
    (c) => sdk.complaintAttachmentLink(c, ids.item, ids.other, { branch: ids.branch }),
    'GET',
    `/v1/branches/${ids.branch}/complaints/${ids.item}/attachments/${ids.other}`,
  ],
  [
    'eligibility',
    eligibility,
    (c) => sdk.readReviewEligibility(c, ids.stay),
    'GET',
    `/v1/me/stays/${ids.stay}/review-eligibility`,
  ],
  [
    'own review',
    own,
    (c) => sdk.readOwnReview(c, ids.stay),
    'GET',
    `/v1/me/stays/${ids.stay}/review`,
  ],
  [
    'create review',
    own,
    (c) => sdk.createReview(c, ids.stay, { ratings }, ids.key),
    'POST',
    `/v1/me/stays/${ids.stay}/review`,
  ],
  [
    'edit review',
    own,
    (c) => sdk.editReview(c, ids.stay, { ratings, expectedVersion: 1 }, ids.key),
    'PATCH',
    `/v1/me/stays/${ids.stay}/review`,
  ],
  [
    'public reviews',
    { branchId: ids.branch, summary: { count: 0, averages: null }, data: [], nextCursor: null },
    (c) => sdk.readPublicReviews(c, ids.branch, { cursor: ids.other }),
    'GET',
    `/v1/public/branches/${ids.branch}/reviews?cursor=${ids.other}`,
  ],
  [
    'branch reviews',
    { data: [staff], nextCursor: null },
    (c) => sdk.readBranchReviews(c, ids.branch),
    'GET',
    `/v1/branches/${ids.branch}/reviews`,
  ],
  [
    'reply',
    staff,
    (c) => sdk.replyToReview(c, ids.branch, ids.item, { body: 'Thanks' }, ids.key),
    'PUT',
    `/v1/branches/${ids.branch}/reviews/${ids.item}/reply`,
  ],
  [
    'report',
    { reportId: ids.other, status: 'open' },
    (c) => sdk.reportReview(c, ids.item, { reason: 'spam' }, ids.key),
    'POST',
    `/v1/reviews/${ids.item}/reports`,
  ],
];
it.each(cases)(
  'SERV/CMP/REV: %s calls its exact route and parses the contract',
  async (_name, data, call, method, path) => {
    const value = fixture(data);
    await expect(call(value.client)).resolves.toEqual(data);
    const request = value.fetch.mock.calls[0]?.[0] as Request;
    expect(request.method).toBe(method);
    expect(request.url).toBe('https://api.example.test' + path);
    if (method !== 'GET') expect(request.headers.get('Idempotency-Key')).toBe(ids.key);
  },
);
it('SEC-003: responses bound to another branch, Stay or review are rejected', async () => {
  await expect(
    sdk.readPublicMenu(fixture({ ...menu, branchId: ids.other }).client, ids.branch),
  ).rejects.toThrow();
  await expect(
    sdk.createComplaint(
      fixture({ ...detail, stayId: ids.other }).client,
      ids.stay,
      { category: 'wifi', title: 't', description: 'd' },
      ids.key,
    ),
  ).rejects.toThrow();
  await expect(
    sdk.replyToReview(
      fixture({ ...staff, id: ids.other }).client,
      ids.branch,
      ids.item,
      { body: 'x' },
      ids.key,
    ),
  ).rejects.toThrow();
  await expect(
    sdk.updateBranchMenu(
      fixture(menu).client,
      ids.branch,
      { expectedVersion: -1, items: [] },
      ids.key,
    ),
  ).rejects.toThrow();
});
