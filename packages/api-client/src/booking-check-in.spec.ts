import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createApiClient } from './client.js';
import { checkInBooking } from './booking-check-in.js';
const branchId = randomUUID(),
  bookingId = randomUUID(),
  key = randomUUID();
function wire(body: unknown) {
  const requests: Request[] = [];
  const client = createApiClient({
    baseUrl: 'https://example.test',
    authentication: { kind: 'cookie', csrf: () => 'fixture-csrf' },
    fetch: async (input, init) => {
      requests.push(input instanceof Request ? input : new Request(input, init));
      return Response.json(body, { status: 201 });
    },
  });
  return { client, requests };
}
const result = {
  branchId,
  bookingId,
  stayId: randomUUID(),
  residentId: randomUUID(),
  agreementId: randomUUID(),
  assignmentId: randomUUID(),
  state: 'active',
  version: 1,
};
const body = {
  policyVersionId: randomUUID(),
  initialBilling: [{ item: 'rent', cadence: 'periodic', periodIndex: 0 }],
};
it('STAY-001 / ACC-001: check-in sends the exact intent with its retained key and binds the result', async () => {
  const value = wire(result);
  expect(await checkInBooking(value.client, branchId, bookingId, body, key)).toEqual(result);
  const request = value.requests[0];
  expect(new URL(request?.url ?? '').pathname).toBe(
    `/v1/branches/${branchId}/stays/bookings/${bookingId}/check-in`,
  );
  expect(request?.headers.get('Idempotency-Key')).toBe(key);
  expect(await request?.json()).toEqual(body);
  await expect(
    checkInBooking(
      wire({ ...result, bookingId: randomUUID() }).client,
      branchId,
      bookingId,
      body,
      key,
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
