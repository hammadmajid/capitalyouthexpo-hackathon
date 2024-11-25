import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { residentReceipts, stays } from '@hsm/db';
import { phaseTwoFixture } from './phase-two-fixture.js';
import { ownProof, paymentFixture, recordPayment } from './stay-payment.fixture.js';
let f: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  f = await phaseTwoFixture(new Date('2026-10-04T10:00:00Z'), undefined, {
    preScannedInventory: true,
  });
});
afterAll(async () => {
  await f?.close();
});
const headers = (token: string, key: string = randomUUID()) => ({
  authorization: 'Bearer ' + token,
  'Idempotency-Key': key,
});
function get(stay: string, token = f.customerAToken) {
  return f.application.inject({
    url: `/v1/me/stays/${stay}/payment-summary`,
    headers: headers(token),
  });
}
async function submit(stay: string, depositPaisa: number, amountPaisa = depositPaisa) {
  return f.application.inject({
    method: 'POST',
    url: `/v1/me/stays/${stay}/payment-proofs`,
    headers: headers(f.customerAToken),
    payload: {
      fileId: await ownProof(f, f.customerA),
      amountPaisa,
      depositPaisa,
      method: 'bank_transfer',
      paidOn: '2026-10-04',
    },
  });
}
it('PAY-008 / ACC-004: security-only proof has one receipt, no invoice and no duplicate security', async () => {
  const item = await paymentFixture(f);
  await f.connection.db
    .update(stays)
    .set({ state: 'active', checkedInAt: f.now, version: 2 })
    .where(eq(stays.id, item.stayId));
  expect((await get(item.stayId, f.customerBToken)).statusCode).toBe(404);
  expect((await get(item.stayId)).json()).toMatchObject({
    outstandingDepositPaisa: 1000001,
    pendingDepositPaisa: 0,
  });
  expect((await submit(item.stayId, 1000002)).statusCode).toBe(409);
  expect((await submit(item.stayId, 500000, 500001)).statusCode).toBe(409);
  const response = await submit(item.stayId, 500000);
  expect(response.statusCode, response.body).toBe(201);
  const proof = response.json<{ id: string; invoiceId: null; depositPaisa: number }>();
  expect(proof).toMatchObject({ invoiceId: null, depositPaisa: 500000 });
  expect((await get(item.stayId)).json()).toMatchObject({
    outstandingDepositPaisa: 1000001,
    pendingDepositPaisa: 500000,
  });
  expect((await submit(item.stayId, 500001)).statusCode).toBe(409);
  const review = () =>
    f.application.inject({
      method: 'POST',
      url: `/v1/branches/${item.branchId}/payment-proofs/${proof.id}/review`,
      headers: headers(f.ownerToken, proof.id),
      payload: { decision: 'approve' },
    });
  const approved = await review();
  expect(approved.statusCode, approved.body).toBe(200);
  expect((await review()).json()).toEqual(approved.json());
  expect((await get(item.stayId)).json()).toMatchObject({
    receivedDepositPaisa: 500000,
    outstandingDepositPaisa: 500001,
    pendingDepositPaisa: 0,
  });
  const receipts = await f.connection.db
    .select()
    .from(residentReceipts)
    .where(eq(residentReceipts.stayId, item.stayId));
  expect(receipts).toHaveLength(1);
  expect(receipts[0]?.snapshot).toMatchObject({
    distribution: { depositPaisa: 500000, advanceCreditPaisa: 0, allocatedPaisa: 0 },
  });
  // Staff cannot classify more than the remaining security as deposit either.
  expect(
    (
      await recordPayment(f, item, randomUUID(), f.ownerToken, {
        ...item.input,
        amountPaisa: 500002,
        allocations: [],
        depositPaisa: 500002,
      })
    ).statusCode,
  ).toBe(409);
});
it('PAY-008: check-in-ready stays cannot collect security', async () => {
  const item = await paymentFixture(f, null);
  // Security collection is only for operational residents, never a closed/ready Stay.
  expect(
    (
      await recordPayment(f, item, randomUUID(), f.ownerToken, {
        ...item.input,
        amountPaisa: 100,
        allocations: [],
        depositPaisa: 100,
      })
    ).statusCode,
  ).toBe(409);
});
