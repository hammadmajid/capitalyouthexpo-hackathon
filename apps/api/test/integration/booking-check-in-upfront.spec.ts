import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import {
  billingPolicies,
  roomTypes,
  bookingPaymentProofs,
  files,
  hostelAuditLog,
  inventoryClaims,
  residentFundMovements,
  residentCharges,
  residentInvoiceCharges,
  residentInvoices,
  residentPayments,
  residentReceipts,
  stays,
  transportRoutes,
  transportSubscriptions,
} from '@hsm/db';
import {
  bookingAdmissionResultSchema,
  bookingPageSchema,
  bookingQuoteSnapshotSchema,
  bookingSummarySchema,
  residentReceiptSnapshotSchema,
} from '@hsm/contracts';
import { verifiedKey } from '@hsm/files';
import { phaseTwoFixture } from './phase-two-fixture.js';
let f: Awaited<ReturnType<typeof phaseTwoFixture>>;
const today = '2026-10-25';
beforeAll(async () => {
  f = await phaseTwoFixture(new Date(today + 'T10:00:00Z'), undefined, {
    preScannedInventory: true,
  });
});
afterAll(async () => {
  await f?.close();
});
const policy = {
  cycle: { kind: 'calendar_month', dueDay: 5 },
  proration: { kind: 'full_period' },
  graceDays: 0,
  lateCharge: { kind: 'disabled' },
  noticeDays: 15,
  earlyCheckout: { kind: 'manual' },
  allowOpenEnded: false,
  customCharges: 'disabled',
  transportBilling: {
    dueDay: 5,
    refundable: false,
    proration: { kind: 'full_period' },
    offer: { mode: 'separate', monthlyChargePaisa: 300000 },
  },
};
const headers = (token: string, key: string = randomUUID()) => ({
  authorization: 'Bearer ' + token,
  'Idempotency-Key': key,
});
async function call(
  method: 'POST' | 'PUT',
  url: string,
  payload: Record<string, unknown>,
  token = f.ownerToken,
) {
  const response = await f.application.inject({ method, url, headers: headers(token), payload });
  expect(response.statusCode, response.body).toBeLessThan(300);
  return response.json() as unknown;
}
async function proofFile(owner = f.customerA) {
  const id = randomUUID(),
    bytes = Buffer.from('Fixture transfer receipt ' + id),
    key = verifiedKey('payment_proof', id);
  await f.storage.storage.putVerified(key, 'application/pdf', bytes);
  await f.connection.db.insert(files).values({
    id,
    uploadedBy: owner,
    bucket: f.storage.bucket,
    visibility: 'private',
    objectKey: key,
    purpose: 'payment_proof',
    scanStatus: 'clean',
    mimeType: 'application/pdf',
    sizeBytes: BigInt(bytes.length),
    sha256: createHash('sha256').update(bytes).digest(),
  });
  return id;
}
// BKG-007/008: an upfront booking confirmed only after its proof is approved.
async function verifiedBooking(
  requirement: 'none' | 'deposit_and_first_rent' = 'deposit_and_first_rent',
  customerB = false,
) {
  const customerToken = customerB ? f.customerBToken : f.customerAToken;
  const customerId = customerB ? f.customerB : f.customerA;
  const item = await f.inventory(),
    policyVersionId = randomUUID(),
    branch = `/v1/branches/${item.branchId}`;
  await f.connection.db
    .update(roomTypes)
    .set({ depositPaisa: 1000000n })
    .where(eq(roomTypes.id, item.roomTypeId));
  await f.connection.db.insert(billingPolicies).values({
    id: policyVersionId,
    branchId: item.branchId,
    policy,
    isCurrent: true,
    createdByUserId: f.ownerId,
  });
  await call('PUT', branch + '/upfront-settings', {
    requirement,
    proofRetryAllowed: true,
  });
  await call('POST', branch + '/payment-instructions', {
    method: 'bank_transfer',
    accountTitle: 'Fixture Hostel',
    accountIdentifier: 'PK00FIXTURE000000',
    instructions: null,
  });
  await f.connection.db.insert(transportRoutes).values({
    branchId: item.branchId,
    name: 'University',
    stops: ['University'],
    departureTimes: [],
    monthlyChargePaisa: 300000n,
    status: 'active',
    version: 1,
    createdByUserId: f.ownerId,
  });
  const quote = bookingQuoteSnapshotSchema.parse(
    await call('POST', `/v1/marketplace/${item.branchId}/quote`, {
      target: { kind: 'bed', roomId: item.roomId, bedId: item.seatId },
      range: { moveInDate: today, moveOutDate: '2026-11-25' },
      transportRequested: true,
    }),
  );
  let booking = bookingSummarySchema.parse(
    await call(
      'POST',
      `/v1/marketplace/${item.branchId}/bookings`,
      { quote, documents: [], permanentAddress: 'Fixture permanent address' },
      customerToken,
    ),
  );
  if (booking.state === 'pending_request' && booking.upfront?.status === 'awaiting_approval')
    booking = bookingSummarySchema.parse(
      await call('POST', `${branch}/bookings/${booking.id}/approve`, { reason: 'Reviewed' }),
    );
  booking = bookingSummarySchema.parse(
    await call(
      'POST',
      `/v1/me/bookings/${booking.id}/payment-proofs`,
      {
        fileId: await proofFile(customerId),
        amountPaisa:
          requirement === 'none'
            ? 300000
            : quote.price.monthlyRentPaisa + quote.price.depositPaisa + 300000,
        method: 'bank_transfer',
        paidOn: today,
        reference: 'TRX-' + booking.id.slice(0, 8),
      },
      customerToken,
    ),
  );
  const proofId = booking.upfront?.proof?.id ?? '';
  booking = bookingSummarySchema.parse(
    await call('POST', `${branch}/bookings/${booking.id}/payment-proofs/${proofId}/review`, {
      decision: 'approve',
    }),
  );
  expect(booking).toMatchObject({ state: 'confirmed', upfront: { status: 'verified' } });
  return { item, booking, proofId, policyVersionId };
}
function checkIn(branchId: string, bookingId: string, policyVersionId: string, key: string) {
  return f.application.inject({
    method: 'POST',
    url: `/v1/branches/${branchId}/stays/bookings/${bookingId}/check-in`,
    headers: headers(f.ownerToken, key),
    payload: {
      policyVersionId,
      initialBilling: [{ item: 'rent', cadence: 'periodic', periodIndex: 0 }],
    },
  });
}
it('BKG-007 / SERV-002: transport-only upfront remains pending until its proof is verified', async () => {
  const { item, booking, policyVersionId } = await verifiedBooking('none', true);
  expect(booking.upfront).toMatchObject({
    requirement: 'none',
    amountPaisa: 300000,
    status: 'verified',
  });
  const response = await checkIn(item.branchId, booking.id, policyVersionId, randomUUID());
  expect(response.statusCode, response.body).toBe(201);
  const result = bookingAdmissionResultSchema.parse(response.json());
  const [receipt] = await f.connection.db
    .select()
    .from(residentReceipts)
    .where(eq(residentReceipts.stayId, result.stayId));
  expect(receipt?.snapshot.distribution).toMatchObject({
    depositPaisa: 0,
    allocatedPaisa: 300000,
    advanceCreditPaisa: 0,
  });
  const allocation = residentReceiptSnapshotSchema.parse(receipt?.snapshot).allocations[0];
  const paid = await f.connection.db
    .select({ kind: residentCharges.kind })
    .from(residentInvoiceCharges)
    .innerJoin(residentCharges, eq(residentCharges.id, residentInvoiceCharges.chargeId))
    .where(eq(residentInvoiceCharges.invoiceId, allocation?.invoiceId ?? randomUUID()));
  expect(paid.map((line) => line.kind).sort()).toEqual(['rent', 'transport']);
  const invoices = await f.connection.db
    .select()
    .from(residentInvoices)
    .where(eq(residentInvoices.stayId, result.stayId));
  expect(invoices).toHaveLength(1);
});
it('BKG-008 / ACC-001 / ACC-004: verified upfront booking checks in once, credits its verified proof once with one receipt', async () => {
  const { item, booking, proofId, policyVersionId } = await verifiedBooking();
  const payments = async () =>
    [
      await f.connection.db.select().from(residentPayments),
      await f.connection.db.select().from(residentReceipts),
      await f.connection.db.select().from(residentFundMovements),
    ].map((rows) => rows.length);
  const before = await payments();
  const keys = [randomUUID(), randomUUID()];
  const racing = await Promise.all(
    keys.map((key) => checkIn(item.branchId, booking.id, policyVersionId, key)),
  );
  expect(racing.map((response) => response.statusCode).sort()).toEqual([201, 409]);
  const winner = racing.findIndex((response) => response.statusCode === 201);
  const admitted = racing[winner];
  const result = bookingAdmissionResultSchema.parse(admitted?.json());
  const replay = await checkIn(item.branchId, booking.id, policyVersionId, keys[winner] ?? '');
  expect(replay.headers['idempotency-replayed']).toBe('true');
  expect(replay.json()).toEqual(admitted?.json());
  expect(await payments()).toEqual([(before[0] ?? 0) + 1, (before[1] ?? 0) + 1, before[2] ?? 0]);
  const [subscription] = await f.connection.db
    .select()
    .from(transportSubscriptions)
    .where(eq(transportSubscriptions.stayId, result.stayId));
  expect(subscription).toMatchObject({ status: 'active', monthlyChargePaisa: 300000n });
  const [receipt] = await f.connection.db
    .select()
    .from(residentReceipts)
    .where(eq(residentReceipts.stayId, result.stayId));
  expect(receipt?.snapshot).toMatchObject({
    distribution: {
      depositPaisa: booking.quote.price.depositPaisa,
      advanceCreditPaisa: 0,
      allocatedPaisa: booking.quote.price.monthlyRentPaisa + 300000,
    },
  });
  const [proof] = await f.connection.db
    .select({ state: bookingPaymentProofs.state })
    .from(bookingPaymentProofs)
    .where(eq(bookingPaymentProofs.id, proofId));
  expect(proof?.state).toBe('approved');
  const [audit] = await f.connection.db
    .select({ after: hostelAuditLog.after })
    .from(hostelAuditLog)
    .where(
      and(
        eq(hostelAuditLog.targetId, result.stayId),
        eq(hostelAuditLog.action, 'resident.booking.checked_in'),
      ),
    );
  expect(JSON.stringify(audit?.after)).toContain(proofId);
  expect(
    await f.connection.db
      .select({ id: stays.id })
      .from(stays)
      .where(eq(stays.bookingId, booking.id)),
  ).toHaveLength(1);
  const live = await f.connection.db
    .select()
    .from(inventoryClaims)
    .where(and(eq(inventoryClaims.roomId, item.roomId), isNull(inventoryClaims.releasedAt)));
  expect(live).toHaveLength(1);
  expect(live[0]).toMatchObject({ assignmentId: result.assignmentId, bookingId: null });
  // STAY-001: staff and Customer booking summaries show the linked Stay.
  for (const [url, token] of [
    [`/v1/branches/${item.branchId}/bookings`, f.ownerToken],
    ['/v1/me/bookings', f.customerAToken],
  ] as const) {
    const page = await f.application.inject({ url, headers: { authorization: 'Bearer ' + token } });
    expect(page.statusCode, page.body).toBe(200);
    const row = bookingPageSchema.parse(page.json()).data.find((entry) => entry.id === booking.id);
    expect(row?.stay).toEqual({ id: result.stayId, state: 'active' });
  }
});
