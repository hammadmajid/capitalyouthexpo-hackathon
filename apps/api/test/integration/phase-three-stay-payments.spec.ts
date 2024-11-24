import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { managerAssignments, managerInventoryGrants, sensitiveAccessLog, stays } from '@hsm/db';
import { recordedResidentPaymentSchema, residentInvoiceBalanceSchema } from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
import {
  paymentFixture,
  recordPayment,
  financialCounts,
  ownProof,
  paymentNotices,
  paymentAudits,
  rejectPaymentNotice,
  restorePaymentNotice,
} from './stay-payment.fixture.js';
let f: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  // Proof scan states are seeded by these tests; retain real PostgreSQL/HTTP and object storage.
  f = await phaseTwoFixture(new Date('2026-10-04T10:00:00Z'), undefined, {
    preScannedInventory: true,
  });
});
afterAll(async () => {
  await f?.close();
});
it('PAY-008 / ACC-004 / NTF-002: concurrent same-key real HTTP records one receipt/audit/notice with authorized replay', async () => {
  const item = await paymentFixture(f),
    key = randomUUID();
  const responses = await Promise.all([recordPayment(f, item, key), recordPayment(f, item, key)]);
  expect(responses.map((row) => row.statusCode)).toEqual([201, 201]);
  const bodies = responses.map((row) => recordedResidentPaymentSchema.parse(row.json()));
  expect(bodies[0]).toEqual(bodies[1]);
  expect(responses.map((row) => row.headers['idempotency-replayed']).sort()).toEqual([
    'false',
    'true',
  ]);
  expect(await financialCounts(f, item)).toEqual([1, 1]);
  expect(await paymentAudits(f, item.branchId)).toHaveLength(1);
  const payment = bodies[0];
  if (!payment) throw Error('Payment response missing');
  const notices = await paymentNotices(f, payment.paymentId);
  expect(notices).toHaveLength(1);
  expect(notices[0]).toMatchObject({
    recipientUserId: f.customerA,
    payload: { event: 'resident.payment_recorded', operationId: payment.paymentId },
  });
  const balance = await f.application.inject({
    url: '/v1/me/stays/' + item.stayId + '/invoices/' + item.invoiceId,
    headers: { authorization: 'Bearer ' + f.customerAToken },
  });
  expect(balance.statusCode).toBe(200);
  expect(residentInvoiceBalanceSchema.parse(balance.json())).toMatchObject({
    state: 'paid',
    outstandingPaisa: 0,
  });
});
it('ACC-004: real concurrent distinct full allocations cannot overpay the invoice', async () => {
  const item = await paymentFixture(f),
    responses = await Promise.all([recordPayment(f, item), recordPayment(f, item)]);
  expect(responses.map((row) => row.statusCode).sort()).toEqual([201, 409]);
  expect(await financialCounts(f, item)).toEqual([1, 1]);
  expect(await paymentAudits(f, item.branchId)).toHaveLength(1);
});
it('ACC-002 / PAY-008: actual Manager needs both grants and loses replay access immediately when deactivated', async () => {
  const item = await paymentFixture(f),
    foreign = await paymentFixture(f),
    assignmentId = randomUUID(),
    key = randomUUID();
  await f.connection.db.insert(managerAssignments).values({
    id: assignmentId,
    userId: f.customerB,
    branchId: item.branchId,
    status: 'active',
    appointedByUserId: f.ownerId,
    activatedAt: f.now,
  });
  await f.connection.db
    .insert(managerInventoryGrants)
    .values({ assignmentId, permission: 'payment_record' });
  expect((await recordPayment(f, item, key, f.customerBToken)).statusCode).toBe(403);
  await f.connection.db
    .insert(managerInventoryGrants)
    .values({ assignmentId, permission: 'finance_view' });
  expect((await recordPayment(f, item, key, f.customerBToken)).statusCode).toBe(201);
  expect((await recordPayment(f, foreign, randomUUID(), f.customerBToken)).statusCode).toBe(403);
  await f.connection.db
    .update(managerAssignments)
    .set({ status: 'deactivated' })
    .where(eq(managerAssignments.id, assignmentId));
  expect((await recordPayment(f, item, key, f.customerBToken)).statusCode).toBe(403);
  expect(await financialCounts(f, item)).toEqual([1, 1]);
});
it('PAY-008 / NTF-002: actual required notice failure rolls back payment/receipt/audit and same-key retry succeeds', async () => {
  const item = await paymentFixture(f),
    key = randomUUID();
  await rejectPaymentNotice(f);
  try {
    const response = await recordPayment(f, item, key);
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('Fixture payment notice failure');
    expect(await financialCounts(f, item)).toEqual([0, 0]);
    expect(await paymentAudits(f, item.branchId)).toEqual([]);
  } finally {
    await restorePaymentNotice(f);
  }
  expect((await recordPayment(f, item, key)).statusCode).toBe(201);
  expect(await financialCounts(f, item)).toEqual([1, 1]);
});
it('SEC-003: actual actor-owned clean private proof attaches only with mandatory sensitive access audit', async () => {
  const item = await paymentFixture(f),
    fileId = await ownProof(f);
  expect(
    (
      await recordPayment(f, item, randomUUID(), f.ownerToken, {
        ...item.input,
        proofFileId: fileId,
      })
    ).statusCode,
  ).toBe(201);
  const audits = await f.connection.db
    .select()
    .from(sensitiveAccessLog)
    .where(eq(sensitiveAccessLog.resourceId, fileId));
  expect(audits).toHaveLength(1);
  expect(audits[0]).toMatchObject({
    actorUserId: f.ownerId,
    subjectUserId: f.ownerId,
    resource: 'private_document',
  });
});
it.each(['foreign', 'pending'] as const)(
  'SEC-003: actual %s proof cannot become an approved payment',
  async (mode) => {
    const item = await paymentFixture(f),
      fileId = await ownProof(f, mode === 'foreign' ? f.customerA : f.ownerId, mode !== 'pending');
    expect(
      (
        await recordPayment(f, item, randomUUID(), f.ownerToken, {
          ...item.input,
          proofFileId: fileId,
        })
      ).statusCode,
    ).toBe(404);
    expect(await financialCounts(f, item)).toEqual([0, 0]);
  },
);
it('RES-003 / PAY-008: actual offline resident receives a receipt without fake account or notification recipient', async () => {
  const item = await paymentFixture(f, null),
    response = await recordPayment(f, item);
  expect(response.statusCode).toBe(201);
  const result = recordedResidentPaymentSchema.parse(response.json());
  expect(await paymentNotices(f, result.paymentId)).toEqual([]);
  const [stay] = await f.connection.db.select().from(stays).where(eq(stays.id, item.stayId));
  expect(stay?.userId).toBeNull();
  expect(await financialCounts(f, item)).toEqual([1, 1]);
});
it('SEC-003: actual foreign invoice allocation and unrelated customer recording are rejected', async () => {
  const item = await paymentFixture(f),
    foreign = await paymentFixture(f);
  expect(
    (
      await recordPayment(f, item, randomUUID(), f.ownerToken, {
        ...item.input,
        allocations: [{ invoiceId: foreign.invoiceId, amountPaisa: 1800001 }],
      })
    ).statusCode,
  ).toBe(404);
  expect((await recordPayment(f, item, randomUUID(), f.customerAToken)).statusCode).toBe(403);
  expect(await financialCounts(f, item)).toEqual([0, 0]);
});

it('PAY-008 / RENT-005: partial rent + agreed security share a receipt; overpayment is blocked', async () => {
  const item = await paymentFixture(f);
  await f.connection.db
    .update(stays)
    .set({ state: 'active', checkedInAt: f.now, version: 2 })
    .where(eq(stays.id, item.stayId));
  const partial = {
    ...item.input,
    amountPaisa: 1000000,
    allocations: [{ invoiceId: item.invoiceId, amountPaisa: 1000000 }],
  };
  expect((await recordPayment(f, item, randomUUID(), f.ownerToken, partial)).statusCode).toBe(201);
  const url = '/v1/me/stays/' + item.stayId + '/invoices/' + item.invoiceId,
    headers = { authorization: 'Bearer ' + f.customerAToken };
  const before = await f.application.inject({ url, headers });
  expect(residentInvoiceBalanceSchema.parse(before.json())).toMatchObject({
    state: 'partially_paid',
    allocatedPaisa: 1000000,
    outstandingPaisa: 800001,
  });
  const remainder = {
    ...item.input,
    amountPaisa: 900001,
    allocations: [{ invoiceId: item.invoiceId, amountPaisa: 800001 }],
    depositPaisa: 100000,
    advanceCreditPaisa: 0,
  };
  expect(
    (
      await recordPayment(f, item, randomUUID(), f.ownerToken, {
        ...remainder,
        amountPaisa: 1000001,
        advanceCreditPaisa: 100000,
      })
    ).statusCode,
  ).toBe(400);
  expect((await recordPayment(f, item, randomUUID(), f.ownerToken, remainder)).statusCode).toBe(
    201,
  );
  const after = await f.application.inject({ url, headers });
  expect(residentInvoiceBalanceSchema.parse(after.json())).toMatchObject({
    state: 'paid',
    allocatedPaisa: 1800001,
    outstandingPaisa: 0,
  });
  expect(await financialCounts(f, item)).toEqual([2, 2]);
});
it('SEC-003 / ACC-004: one real proof cannot approve a second unrelated external receipt', async () => {
  const item = await paymentFixture(f),
    other = await paymentFixture(f),
    fileId = await ownProof(f);
  expect(
    (
      await recordPayment(f, item, randomUUID(), f.ownerToken, {
        ...item.input,
        proofFileId: fileId,
      })
    ).statusCode,
  ).toBe(201);
  expect(
    (
      await recordPayment(f, other, randomUUID(), f.ownerToken, {
        ...other.input,
        proofFileId: fileId,
      })
    ).statusCode,
  ).toBe(409);
  expect(await financialCounts(f, other)).toEqual([0, 0]);
  expect(await paymentAudits(f, other.branchId)).toEqual([]);
});
