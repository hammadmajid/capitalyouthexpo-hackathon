import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createApiClient } from './client.js';
import {
  addPaymentInstruction,
  approveUpfrontBooking,
  reviewBookingPaymentProof,
  submitBookingPaymentProof,
  updateUpfrontSettings,
} from './booking-upfront.js';
const branchId = randomUUID(),
  bookingId = randomUUID(),
  proofId = randomUUID(),
  key = randomUUID(),
  at = '2026-10-25T10:00:00.000Z';
const policyVersion = randomUUID();
const quote = {
  version: 1,
  listing: {
    hostelName: 'Hostel',
    branchName: 'Branch',
    roomTypeName: 'Two beds',
    roomLabel: '101',
    bedLabel: 'A',
  },
  currency: 'PKR',
  range: { moveInDate: '2026-11-01', moveOutDate: '2026-12-01' },
  target: { kind: 'bed', roomId: randomUUID(), bedId: randomUUID() },
  policy: {
    bookingMode: 'request',
    holdSeconds: 600,
    requestExpirySeconds: 3600,
    requestReservesInventory: true,
    minimumStayDays: 1,
    maximumStayDays: 365,
    minimumAdvanceDays: 0,
    maximumAdvanceDays: 365,
    customerSelectsInventory: true,
    cancellationAllowed: true,
    cancellationCutoffHours: 0,
    allowedStayUnits: ['month'],
    requiredDocuments: [],
    allowEvidenceReuse: true,
    documentReviewRequired: false,
  },
  policyVersion,
  policyLineage: [policyVersion],
  quotedAt: at,
  price: { monthlyRentPaisa: 1800000, depositPaisa: 0, fees: [] },
};
const proof = {
  id: proofId,
  state: 'submitted',
  amountPaisa: 1800000,
  method: 'bank_transfer',
  paidOn: '2026-10-25',
  reference: null,
  submittedAt: at,
  reviewedAt: null,
  reviewReason: null,
};
function booking(upfront: unknown, state = 'pending_request') {
  return {
    id: bookingId,
    branchId,
    reference: 'HSM-' + bookingId.replaceAll('-', '').toUpperCase(),
    state,
    quote,
    createdAt: at,
    requestExpiresAt: state === 'pending_request' ? '2026-10-25T11:00:00.000Z' : null,
    documents: [],
    upfront,
  };
}
const base = { requirement: 'first_rent', amountPaisa: 1800000, approvedAt: at };
function wire(body: unknown, status = 200) {
  const requests: Request[] = [];
  const client = createApiClient({
    baseUrl: 'https://example.test',
    authentication: { kind: 'cookie', csrf: () => 'fixture-csrf' },
    fetch: async (input, init) => {
      requests.push(input instanceof Request ? input : new Request(input, init));
      return Response.json(body, { status });
    },
  });
  return { client, requests };
}
it('SRS v2.11: approval succeeds only when payment is requested, never as confirmation', async () => {
  const opened = booking({ ...base, status: 'awaiting_payment', proof: null });
  const value = wire(opened);
  expect(await approveUpfrontBooking(value.client, branchId, bookingId, 'Reviewed', key)).toEqual(
    opened,
  );
  expect(new URL(value.requests[0]?.url ?? '').pathname).toBe(
    `/v1/branches/${branchId}/bookings/${bookingId}/approve`,
  );
  expect(value.requests[0]?.headers.get('Idempotency-Key')).toBe(key);
  await expect(
    approveUpfrontBooking(
      wire(
        booking(
          { ...base, status: 'verified', proof: { ...proof, state: 'approved', reviewedAt: at } },
          'confirmed',
        ),
      ).client,
      branchId,
      bookingId,
      'Reviewed',
      key,
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('BKG-008: proof submission requires the pending exact-amount proof in the response', async () => {
  const input = {
    fileId: randomUUID(),
    amountPaisa: 1800000,
    method: 'bank_transfer',
    paidOn: '2026-10-25',
    reference: null,
  };
  const pending = booking({ ...base, status: 'verification_pending', proof });
  expect(await submitBookingPaymentProof(wire(pending, 201).client, bookingId, input, key)).toEqual(
    pending,
  );
  await expect(
    submitBookingPaymentProof(
      wire(
        booking({ ...base, status: 'verification_pending', proof: { ...proof, amountPaisa: 1 } }),
        201,
      ).client,
      bookingId,
      input,
      key,
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('ACC-004: an approving review must report a confirmed booking with this verified proof', async () => {
  const verified = booking(
    { ...base, status: 'verified', proof: { ...proof, state: 'approved', reviewedAt: at } },
    'confirmed',
  );
  expect(
    await reviewBookingPaymentProof(
      wire(verified).client,
      branchId,
      bookingId,
      proofId,
      { decision: 'approve' },
      key,
    ),
  ).toEqual(verified);
  await expect(
    reviewBookingPaymentProof(
      wire(booking({ ...base, status: 'verification_pending', proof })).client,
      branchId,
      bookingId,
      proofId,
      { decision: 'approve' },
      key,
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  const rejected = booking({
    ...base,
    status: 'awaiting_payment',
    proof: { ...proof, state: 'rejected', reviewedAt: at, reviewReason: 'Missing' },
  });
  expect(
    await reviewBookingPaymentProof(
      wire(rejected).client,
      branchId,
      bookingId,
      proofId,
      { decision: 'reject', reason: 'Missing' },
      key,
    ),
  ).toEqual(rejected);
});
it('BKG-007: Owner settings and instructions must echo exactly what was saved', async () => {
  const settings = { requirement: 'deposit', proofRetryAllowed: false };
  expect(await updateUpfrontSettings(wire(settings).client, branchId, settings, key)).toEqual(
    settings,
  );
  await expect(
    updateUpfrontSettings(
      wire({ ...settings, requirement: 'none' }).client,
      branchId,
      settings,
      key,
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  const input = {
    method: 'jazzcash',
    accountTitle: 'Hostel',
    accountIdentifier: '03000000000',
    instructions: null,
  };
  const saved = { ...input, id: randomUUID(), branchId, createdAt: at };
  expect(await addPaymentInstruction(wire(saved, 201).client, branchId, input, key)).toEqual(saved);
  await expect(
    addPaymentInstruction(
      wire({ ...saved, branchId: randomUUID() }, 201).client,
      branchId,
      input,
      key,
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
