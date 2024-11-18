import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { bookingQuoteSnapshotSchema } from '@hsm/contracts';
import { createApiClient } from './client.js';
import {
  listCustomerBookings,
  createBookingHold,
  createCustomerBooking,
  cancelCustomerBooking,
} from './bookings.js';
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
it('BKG-001 / SEC-003: own history preserves server state and authenticated pagination', async () => {
  const value = wire({ data: [booking], nextCursor: id });
  expect((await listCustomerBookings(value.client, { cursor: id, limit: 10 })).data[0]?.state).toBe(
    'pending_request',
  );
  expect(value.request().headers.get('Authorization')).toBe('Bearer fixture-token');
  expect(new URL(value.request().url).searchParams.get('cursor')).toBe(id);
});
it('BKG-001: empty history and default page remain actual server results', async () => {
  const value = wire({ data: [], nextCursor: null });
  expect(await listCustomerBookings(value.client)).toEqual({ data: [], nextCursor: null });
  expect(new URL(value.request().url).searchParams.get('limit')).toBe('20');
});
it('BKG-003 / SEC-003: holds retain authentication, exact server quote and idempotency', async () => {
  const value = wire({ id, branchId, quote, expiresAt: '2026-10-14T12:10:00Z' });
  await createBookingHold(value.client, branchId, quote, key);
  expect(value.request().headers.get('Authorization')).toBe('Bearer fixture-token');
  expect(value.request().headers.get('Idempotency-Key')).toBe(key);
  expect(new URL(value.request().url).pathname).toBe(`/v1/marketplace/${branchId}/holds`);
  expect(await value.request().json()).toEqual({ quote });
});
it('BKG-001 / CHG-007: creation sends policy-bound evidence with cookie CSRF', async () => {
  const value = wire(booking, true),
    input = { quote, documents: [] };
  expect(await createCustomerBooking(value.client, branchId, input, key)).toEqual(booking);
  expect(value.request().credentials).toBe('include');
  expect(value.request().headers.get('X-CSRF-Token')).toBe('fixture-csrf');
  expect(await value.request().json()).toEqual(input);
});
it('CHG-042: hold and booking serialization preserve the agreed included routes', async () => {
  const included = { ...quote, includedTransport: [{ id, name: 'Campus shuttle' }] };
  const hold = wire({ id, branchId, quote: included, expiresAt: '2026-10-14T12:10:00Z' });
  await createBookingHold(hold.client, branchId, included, key);
  expect(await hold.request().json()).toEqual({ quote: included });
  const submission = wire(booking);
  await createCustomerBooking(submission.client, branchId, { quote: included, documents: [] }, key);
  expect(await submission.request().json()).toEqual({ quote: included, documents: [] });
});
it('BKG-009: cancellation sends validated reason and returns only persisted server state', async () => {
  const value = wire({ ...booking, state: 'cancelled' });
  expect((await cancelCustomerBooking(value.client, id, ' Change of plans ', key)).state).toBe(
    'cancelled',
  );
  expect(await value.request().json()).toEqual({ reason: 'Change of plans' });
  expect(new URL(value.request().url).pathname).toBe(`/v1/me/bookings/${id}/cancel`);
  expect(value.request().headers.get('Idempotency-Key')).toBe(key);
});
it('SEC-003: client-supplied account scope and malformed mutations fail before IO', () => {
  const value = wire({});
  expect(() =>
    listCustomerBookings(value.client, Object.assign({ limit: 10 }, { customerUserId: id })),
  ).toThrow();
  expect(() => createBookingHold(value.client, 'invalid', quote, key)).toThrow();
  expect(() =>
    createCustomerBooking(value.client, branchId, { quote, documents: [] }, 'invalid'),
  ).toThrow();
  expect(() => cancelCustomerBooking(value.client, id, ' ', key)).toThrow();
  expect(value.requests).toHaveLength(0);
});
it('SEC-003: private server additions cannot reach booking history UI', async () => {
  const value = wire({ data: [{ ...booking, customerCnic: 'private' }], nextCursor: null });
  await expect(listCustomerBookings(value.client)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});

it('BKG-003 / CHG-007: optional hold and identity fields are omitted unless supplied', async () => {
  const absent = wire(booking);
  await createCustomerBooking(
    absent.client,
    branchId,
    { quote, documents: [], holdId: undefined, cnic: undefined, permanentAddress: undefined },
    key,
  );
  expect(await absent.request().json()).toEqual({ quote, documents: [] });
  const held = wire(booking);
  await createCustomerBooking(held.client, branchId, { quote, documents: [], holdId: id }, key);
  expect(await held.request().json()).toEqual({ quote, documents: [], holdId: id });
});

it('AUTH-C-005 / SEC-003: private permanent address is trimmed in the booking request and absent from the result', async () => {
  const value = wire(booking);
  const result = await createCustomerBooking(
    value.client,
    branchId,
    {
      quote,
      documents: [],
      permanentAddress: '  House 12, Islamabad  ',
    },
    key,
  );
  expect(await value.request().json()).toEqual({
    quote,
    documents: [],
    permanentAddress: 'House 12, Islamabad',
  });
  expect(result).not.toHaveProperty('permanentAddress');
});
