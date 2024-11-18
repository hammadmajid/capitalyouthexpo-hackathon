import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { bookingQuoteSnapshotSchema } from '@hsm/contracts';
import { createApiClient } from './client.js';
import {
  listHostelBookings,
  transitionHostelBooking,
  readBranchInventory,
} from './hostel-bookings.js';
const branchId = randomUUID(),
  roomId = randomUUID(),
  policyId = randomUUID(),
  id = randomUUID(),
  key = randomUUID();
const quoteInput = {
  target: { kind: 'room' as const, roomId },
  range: { moveInDate: '2026-10-15', moveOutDate: '2026-11-15' },
};
const quote = bookingQuoteSnapshotSchema.parse({
  version: 1,
  currency: 'PKR',
  ...quoteInput,
  listing: {
    hostelName: 'Fixture hostel',
    branchName: 'Fixture branch',
    roomTypeName: 'Two beds',
    roomLabel: '101',
    bedLabel: null,
  },
  price: { monthlyRentPaisa: 1800001, depositPaisa: 0, fees: [] },
  policyVersion: policyId,
  policyLineage: [policyId],
  quotedAt: '2026-10-14T12:00:00Z',
  policy: {
    bookingMode: 'request',
    holdSeconds: 600,
    requestExpirySeconds: 3600,
    requestReservesInventory: true,
    minimumStayDays: 1,
    maximumStayDays: 'unlimited',
    minimumAdvanceDays: 0,
    maximumAdvanceDays: 365,
    customerSelectsInventory: true,
    cancellationAllowed: true,
    cancellationCutoffHours: 0,
    allowedStayUnits: ['day', 'week', 'month'],
    requiredDocuments: [],
    allowEvidenceReuse: true,
    documentReviewRequired: false,
  },
});
const booking = {
  id,
  branchId,
  reference: 'HSM-' + id.replaceAll('-', '').toUpperCase(),
  state: 'pending_request',
  quote,
  createdAt: '2026-10-14T12:00:00Z',
  requestExpiresAt: '2026-10-14T13:00:00Z',
  documents: [],
  upfront: null,
};
function wire(body: unknown, cookie = false) {
  const requests: Request[] = [];
  const client = createApiClient({
    baseUrl: 'https://example.test',
    authentication: cookie
      ? { kind: 'cookie', csrf: () => 'fixture-csrf' }
      : { kind: 'bearer', accessToken: async () => 'fixture-token' },
    fetch: async (input, init) => {
      requests.push(input instanceof Request ? input : new Request(input, init));
      return Response.json(body);
    },
  });
  function request() {
    const first = requests[0];
    if (!first) throw new Error('Missing request');
    return first;
  }
  return { client, requests, request };
}
it('BKG-001 / ACC-004: hostel history sends exact branch scope and real cursor pagination', async () => {
  const value = wire({ data: [booking], nextCursor: id });
  expect(await listHostelBookings(value.client, branchId, { cursor: id, limit: 10 })).toEqual({
    data: [booking],
    nextCursor: id,
  });
  const url = new URL(value.request().url);
  expect(url.pathname).toBe(`/v1/branches/${branchId}/bookings`);
  expect(url.searchParams.get('cursor')).toBe(id);
  expect(value.request().headers.get('Authorization')).toBe('Bearer fixture-token');
});
it.each(['confirm', 'reject', 'cancel'] as const)(
  'BKG-004 / SEC-003: hostel %s preserves CSRF, idempotency and explicit reason',
  async (action) => {
    const changed = {
      ...booking,
      state: ({ confirm: 'confirmed', reject: 'rejected', cancel: 'cancelled' } as const)[action],
    };
    const value = wire(changed, true);
    expect(
      await transitionHostelBooking(
        value.client,
        branchId,
        id,
        action,
        ' Requirements checked ',
        key,
      ),
    ).toEqual(changed);
    expect(new URL(value.request().url).pathname).toBe(
      `/v1/branches/${branchId}/bookings/${id}/${action}`,
    );
    expect(value.request().credentials).toBe('include');
    expect(value.request().headers.get('X-CSRF-Token')).toBe('fixture-csrf');
    expect(value.request().headers.get('Idempotency-Key')).toBe(key);
    expect(await value.request().json()).toEqual({ reason: 'Requirements checked' });
  },
);
it('ACC-004 / SEC-003: malformed branch scope, extra account scope and empty reasons fail before IO', () => {
  const value = wire({});
  expect(() => listHostelBookings(value.client, 'invalid')).toThrow();
  expect(() =>
    listHostelBookings(
      value.client,
      branchId,
      Object.assign({ limit: 10 }, { customerUserId: id }),
    ),
  ).toThrow();
  expect(() => transitionHostelBooking(value.client, branchId, id, 'confirm', ' ', key)).toThrow();
  expect(value.requests).toHaveLength(0);
});
it('SEC-003: hostel summaries reject unexpected private customer documents and identity fields', async () => {
  const value = wire({ data: [{ ...booking, customerUserId: id }], nextCursor: null });
  await expect(listHostelBookings(value.client, branchId)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});
it('BKG-001: default history page preserves truthful empty results', async () => {
  const value = wire({ data: [], nextCursor: null });
  expect(await listHostelBookings(value.client, branchId)).toEqual({ data: [], nextCursor: null });
  expect(new URL(value.request().url).searchParams.get('limit')).toBe('20');
});

it('ACC-004: management permissions come only from validated branch inventory state', async () => {
  const body = {
    roomTypes: [],
    rooms: [],
    permissions: ['booking_manage'],
    canConfigureManagers: false,
  };
  const value = wire(body);
  expect(await readBranchInventory(value.client, branchId)).toEqual(body);
  expect(new URL(value.request().url).pathname).toBe(`/v1/branches/${branchId}/inventory`);
});

it('ACC-004: a valid but foreign branch response cannot populate current management history', async () => {
  const value = wire({ data: [{ ...booking, branchId: randomUUID() }], nextCursor: null });
  await expect(listHostelBookings(value.client, branchId)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});
it('ACC-004: an action response for another booking cannot replace the selected state', async () => {
  const value = wire({ ...booking, id: randomUUID(), state: 'confirmed' });
  await expect(
    transitionHostelBooking(value.client, branchId, id, 'confirm', 'Verified', key),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});

it('BKG-004: a successful action with an incompatible server lifecycle state is rejected', async () => {
  const value = wire(booking);
  await expect(
    transitionHostelBooking(value.client, branchId, id, 'confirm', 'Verified', key),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});

it('AUD-009 / BKG-004: pending queue is serialized with branch and cursor before pagination', async () => {
  const value = wire({ data: [booking], nextCursor: id });
  await listHostelBookings(value.client, branchId, {
    cursor: id,
    limit: 1,
    queue: 'pending_requests',
  });
  expect(new URL(value.request().url).searchParams.get('queue')).toBe('pending_requests');
});
