import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import {
  bookingPaymentProofs,
  bookingPolicies,
  bookings,
  files,
  hostelAuditLog,
  inventoryClaims,
  managerAssignments,
  managerInventoryGrants,
  notificationOutbox,
  sensitiveAccessLog,
} from '@hsm/db';
import {
  bookingQuoteSnapshotSchema,
  bookingSummarySchema,
  paymentInstructionListSchema,
} from '@hsm/contracts';
import { verifiedKey } from '@hsm/files';
import { phaseTwoFixture, fixturePolicy, fixtureLimits } from './phase-two-fixture.js';
import { confirmedBookingHandoff } from '../../src/booking/handoff.js';
let f: Awaited<ReturnType<typeof phaseTwoFixture>>;
type Item = Awaited<ReturnType<typeof f.inventory>>;
beforeAll(async () => {
  f = await phaseTwoFixture(new Date('2026-10-25T10:00:00Z'));
});
afterAll(async () => {
  await f?.close();
});
const headers = (token: string) => ({
  authorization: 'Bearer ' + token,
  'Idempotency-Key': randomUUID(),
});
async function policy(bookingMode: 'request' | 'instant') {
  await f.connection.db.transaction(async (database) => {
    await database
      .update(bookingPolicies)
      .set({ isCurrent: false })
      .where(eq(bookingPolicies.isCurrent, true));
    await database.insert(bookingPolicies).values({
      id: randomUUID(),
      policy: { ...fixturePolicy, bookingMode },
      platformLimits: fixtureLimits,
      isCurrent: true,
      createdByUserId: f.ownerId,
    });
  });
}
async function settings(item: Item, requirement: string, proofRetryAllowed = true) {
  const response = await f.application.inject({
    method: 'PUT',
    url: `/v1/branches/${item.branchId}/upfront-settings`,
    headers: headers(f.ownerToken),
    payload: { requirement, proofRetryAllowed },
  });
  expect(response.statusCode, response.body).toBe(200);
}
async function request(item: Item, bedId = item.seatId) {
  const quoted = await f.application.inject({
    method: 'POST',
    url: `/v1/marketplace/${item.branchId}/quote`,
    payload: {
      target: { kind: 'bed', roomId: item.roomId, bedId },
      range: { moveInDate: '2026-11-01', moveOutDate: '2026-12-01' },
    },
  });
  expect(quoted.statusCode, quoted.body).toBe(200);
  const created = await f.application.inject({
    method: 'POST',
    url: `/v1/marketplace/${item.branchId}/bookings`,
    headers: headers(f.customerAToken),
    payload: {
      quote: bookingQuoteSnapshotSchema.parse(quoted.json()),
      documents: [],
      permanentAddress: 'Fixture permanent address',
    },
  });
  expect(created.statusCode, created.body).toBe(201);
  return bookingSummarySchema.parse(created.json());
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
async function submit(bookingId: string, amountPaisa: number, fileId?: string) {
  return f.application.inject({
    method: 'POST',
    url: `/v1/me/bookings/${bookingId}/payment-proofs`,
    headers: headers(f.customerAToken),
    payload: {
      fileId: fileId ?? (await proofFile()),
      amountPaisa,
      method: 'bank_transfer',
      paidOn: '2026-10-25',
      reference: 'TRX-' + bookingId.slice(0, 8),
    },
  });
}
function staff(
  item: Item,
  path: string,
  payload: Record<string, unknown>,
  token = f.ownerToken,
  key?: string,
) {
  return f.application.inject({
    method: 'POST',
    url: `/v1/branches/${item.branchId}/bookings/${path}`,
    headers: { ...headers(token), ...(key ? { 'Idempotency-Key': key } : {}) },
    payload,
  });
}
it('BKG-002/005/007/008 / ACC-004: request → approval → proof → verification confirms exactly once', async () => {
  await policy('request');
  const item = await f.inventory();
  await settings(item, 'first_rent');
  const booking = await request(item);
  expect(booking.upfront).toMatchObject({
    requirement: 'first_rent',
    amountPaisa: booking.quote.price.monthlyRentPaisa,
    status: 'awaiting_approval',
  });
  expect((await staff(item, booking.id + '/confirm', { reason: 'Direct' })).statusCode).toBe(409);
  expect((await submit(booking.id, booking.quote.price.monthlyRentPaisa)).statusCode).toBe(409);
  const instruction = await f.application.inject({
    method: 'POST',
    url: `/v1/branches/${item.branchId}/payment-instructions`,
    headers: headers(f.ownerToken),
    payload: {
      method: 'bank_transfer',
      accountTitle: 'Fixture Hostel',
      accountIdentifier: 'PK00FIXTURE000000',
      instructions: null,
    },
  });
  expect(instruction.statusCode, instruction.body).toBe(201);
  const hidden = await f.application.inject({
    url: `/v1/me/bookings/${booking.id}/payment-instructions`,
    headers: { authorization: 'Bearer ' + f.customerAToken },
  });
  expect(hidden.statusCode).toBe(409);
  const approved = await staff(item, booking.id + '/approve', { reason: 'Documents reviewed' });
  expect(approved.statusCode, approved.body).toBe(200);
  expect(bookingSummarySchema.parse(approved.json())).toMatchObject({
    state: 'pending_request',
    upfront: { status: 'awaiting_payment' },
  });
  const visible = await f.application.inject({
    url: `/v1/me/bookings/${booking.id}/payment-instructions`,
    headers: { authorization: 'Bearer ' + f.customerAToken },
  });
  expect(paymentInstructionListSchema.parse(visible.json()).data).toHaveLength(1);
  expect(
    (
      await f.application.inject({
        url: `/v1/me/bookings/${booking.id}/payment-instructions`,
        headers: { authorization: 'Bearer ' + f.customerBToken },
      })
    ).statusCode,
  ).toBe(404);
  expect((await submit(booking.id, 1)).statusCode).toBe(422);
  expect((await submit(booking.id, 1800000, await proofFile(f.customerB))).statusCode).toBe(404);
  const first = await submit(booking.id, booking.quote.price.monthlyRentPaisa);
  expect(first.statusCode, first.body).toBe(201);
  const pending = bookingSummarySchema.parse(first.json());
  expect(pending.upfront?.status).toBe('verification_pending');
  expect((await submit(booking.id, booking.quote.price.monthlyRentPaisa)).statusCode).toBe(409);
  const proofId = pending.upfront?.proof?.id ?? '';
  const rejected = await staff(item, `${booking.id}/payment-proofs/${proofId}/review`, {
    decision: 'reject',
    reason: 'Amount not received',
  });
  expect(rejected.statusCode, rejected.body).toBe(200);
  expect(bookingSummarySchema.parse(rejected.json()).upfront).toMatchObject({
    status: 'awaiting_payment',
    proof: { state: 'rejected', reviewReason: 'Amount not received' },
  });
  const second = bookingSummarySchema.parse(
    (await submit(booking.id, booking.quote.price.monthlyRentPaisa)).json(),
  );
  const secondId = second.upfront?.proof?.id ?? '';
  const link = await f.application.inject({
    url: `/v1/branches/${item.branchId}/bookings/${booking.id}/payment-proofs/${secondId}/download`,
    headers: { authorization: 'Bearer ' + f.ownerToken },
  });
  expect(link.statusCode, link.body).toBe(200);
  expect(
    await f.connection.db
      .select()
      .from(sensitiveAccessLog)
      .where(eq(sensitiveAccessLog.resource, 'booking_payment_proof')),
  ).not.toHaveLength(0);
  const key = randomUUID(),
    path = `${booking.id}/payment-proofs/${secondId}/review`;
  const verified = await staff(item, path, { decision: 'approve' }, f.ownerToken, key);
  expect(verified.statusCode, verified.body).toBe(200);
  expect(bookingSummarySchema.parse(verified.json())).toMatchObject({
    state: 'confirmed',
    upfront: { status: 'verified', proof: { id: secondId, state: 'approved' } },
  });
  const replay = await staff(item, path, { decision: 'approve' }, f.ownerToken, key);
  expect(replay.headers['idempotency-replayed']).toBe('true');
  expect((await staff(item, path, { decision: 'approve' })).statusCode).toBe(409);
  const claims = await f.connection.db
    .select()
    .from(inventoryClaims)
    .where(eq(inventoryClaims.bookingId, booking.id));
  expect(claims.filter((claim) => claim.releasedAt === null)).toHaveLength(1);
  const events = await f.connection.db
    .select({ key: notificationOutbox.dedupeKey })
    .from(notificationOutbox)
    .where(sql`${notificationOutbox.dedupeKey} like ${'booking.lifecycle:%' + booking.id + '%'}`);
  expect(events.map((row) => row.key.split(':')[1]).sort()).toEqual(
    [
      'booking.approved',
      'booking.confirmed',
      'booking.payment_rejected',
      'booking.payment_submitted',
      'booking.payment_submitted',
      'booking.submitted',
    ].sort(),
  );
  // Phase 4 boundary: the confirmed booking hands off exact terms and verified evidence only.
  const handoff = await f.connection.db.transaction((database) =>
    confirmedBookingHandoff(database, booking.id),
  );
  expect(handoff).toMatchObject({
    bookingId: booking.id,
    customerUserId: f.customerA,
    roomId: item.roomId,
    bedId: item.seatId,
    upfront: { status: 'verified', proof: { id: secondId } },
    quote: booking.quote,
  });
  await expect(
    f.connection.db.transaction((database) => confirmedBookingHandoff(database, randomUUID())),
  ).rejects.toMatchObject({ status: 409 });
  const audit = await f.connection.db
    .select({ action: hostelAuditLog.action })
    .from(hostelAuditLog)
    .where(eq(hostelAuditLog.targetId, booking.id));
  expect(audit.map((row) => row.action)).toEqual(
    expect.arrayContaining([
      'booking.hostel_approved',
      'booking.payment_proof_submitted',
      'booking.payment_proof_rejected',
      'booking.payment_proof_approved',
      'booking.hostel_confirmed',
    ]),
  );
});
it('ACC-001 / ACC-004: concurrent reviews verify once; partial Manager grants cannot review', async () => {
  await policy('request');
  const item = await f.inventory();
  await settings(item, 'first_rent');
  const booking = await request(item);
  await staff(item, booking.id + '/approve', { reason: 'Approved' });
  const submitted = bookingSummarySchema.parse(
    (await submit(booking.id, booking.quote.price.monthlyRentPaisa)).json(),
  );
  const proofId = submitted.upfront?.proof?.id ?? '',
    path = `${booking.id}/payment-proofs/${proofId}/review`,
    assignmentId = randomUUID();
  await f.connection.db.insert(managerAssignments).values({
    id: assignmentId,
    userId: f.customerB,
    branchId: item.branchId,
    status: 'active',
    appointedByUserId: f.ownerId,
    activatedAt: f.now,
  });
  try {
    await f.connection.db
      .insert(managerInventoryGrants)
      .values({ assignmentId, permission: 'booking_manage', grantedAt: f.now });
    expect((await staff(item, path, { decision: 'approve' }, f.customerBToken)).statusCode).toBe(
      403,
    );
    await f.connection.db.insert(managerInventoryGrants).values(
      (['payment_record', 'finance_view'] as const).map((permission) => ({
        assignmentId,
        permission,
        grantedAt: f.now,
      })),
    );
    const results = await Promise.all([
      staff(item, path, { decision: 'approve' }, f.customerBToken),
      staff(item, path, { decision: 'approve' }),
    ]);
    expect(results.map((result) => result.statusCode).sort()).toEqual([200, 409]);
  } finally {
    await f.connection.db
      .update(managerAssignments)
      .set({ status: 'deactivated', deactivatedAt: f.now })
      .where(eq(managerAssignments.id, assignmentId));
  }
  const [stored] = await f.connection.db.select().from(bookings).where(eq(bookings.id, booking.id));
  expect(stored?.state).toBe('confirmed');
});
it('BKG-006 / AUD-001: instant upfront requests wait for payment; history and confirmation are guarded', async () => {
  await policy('instant');
  const item = await f.inventory();
  await settings(item, 'first_rent', false);
  const booking = await request(item);
  expect(booking).toMatchObject({
    state: 'pending_request',
    upfront: { status: 'awaiting_payment' },
  });
  await expect(
    f.connection.db.update(bookings).set({ state: 'confirmed' }).where(eq(bookings.id, booking.id)),
  ).rejects.toThrow();
  const submitted = bookingSummarySchema.parse(
    (await submit(booking.id, booking.quote.price.monthlyRentPaisa)).json(),
  );
  const proofId = submitted.upfront?.proof?.id ?? '';
  await expect(
    f.connection.db
      .update(bookingPaymentProofs)
      .set({ amountPaisa: 1n })
      .where(eq(bookingPaymentProofs.id, proofId)),
  ).rejects.toThrow();
  await expect(
    f.connection.db.delete(bookingPaymentProofs).where(eq(bookingPaymentProofs.id, proofId)),
  ).rejects.toThrow();
  await staff(item, `${booking.id}/payment-proofs/${proofId}/review`, {
    decision: 'reject',
    reason: 'Unreadable screenshot',
  });
  expect((await submit(booking.id, booking.quote.price.monthlyRentPaisa)).statusCode).toBe(409);
  const withdrawn = await f.application.inject({
    method: 'POST',
    url: `/v1/me/bookings/${booking.id}/cancel`,
    headers: headers(f.customerAToken),
    payload: { reason: 'Changed plans' },
  });
  expect(withdrawn.statusCode, withdrawn.body).toBe(200);
  const [proof] = await f.connection.db
    .select()
    .from(bookingPaymentProofs)
    .where(and(eq(bookingPaymentProofs.bookingId, booking.id)));
  expect(proof?.state).toBe('rejected');
  await policy('instant');
});
