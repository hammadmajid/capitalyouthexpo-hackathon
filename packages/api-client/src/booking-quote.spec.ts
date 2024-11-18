import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { bookingQuoteSnapshotSchema } from '@hsm/contracts';
import { createApiClient } from './client.js';
import { requestBookingQuote } from './booking-quote.js';
const branchId = randomUUID(),
  roomId = randomUUID(),
  policyId = randomUUID();
const input = {
  target: { kind: 'room' as const, roomId },
  range: { moveInDate: '2026-10-15', moveOutDate: '2026-11-15' },
};
const quote = bookingQuoteSnapshotSchema.parse({
  version: 1,
  currency: 'PKR',
  ...input,
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
function fixture(body: unknown = quote) {
  const accessToken = vi.fn(async () => 'unused-fixture-token'),
    requests: Request[] = [];
  const client = createApiClient({
    baseUrl: 'https://example.test',
    authentication: { kind: 'bearer', accessToken },
    fetch: async (request, init) => {
      requests.push(request instanceof Request ? request : new Request(request, init));
      return Response.json(body);
    },
  });
  return { client, accessToken, requests };
}
it('BKG-003/004 ACC-002: anonymous quotes use server terms and never load a session token', async () => {
  const wire = fixture();
  expect(await requestBookingQuote(wire.client, branchId, input)).toEqual(quote);
  expect(wire.accessToken).not.toHaveBeenCalled();
  const request = wire.requests[0];
  if (!request) throw new Error('Quote request missing');
  expect(request.method).toBe('POST');
  expect(request.headers.has('Authorization')).toBe(false);
  expect(await request.json()).toEqual(input);
});
it('BKG-003: invalid dates and branch identifiers fail before network access', () => {
  const wire = fixture();
  expect(() => requestBookingQuote(wire.client, 'invalid', input)).toThrow();
  expect(() =>
    requestBookingQuote(wire.client, branchId, {
      ...input,
      range: { ...input.range, moveOutDate: '2026-10-01' },
    }),
  ).toThrow();
  expect(wire.requests).toHaveLength(0);
});
it('ACC-002: a quote cannot silently add private requester fields', async () => {
  const wire = fixture({ ...quote, customerName: 'Private' });
  await expect(requestBookingQuote(wire.client, branchId, input)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});
