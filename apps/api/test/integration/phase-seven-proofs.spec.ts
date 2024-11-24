import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import {
  billingPolicies,
  roomTypes,
  inventoryClaims,
  managerAssignments,
  managerInventoryGrants,
  residentCharges,
  residentInvoiceCharges,
  residentInvoices,
  residentLedger,
  residentPayments,
  residentReceipts,
  stayAssignments,
  stays,
} from '@hsm/db';
import {
  bookingAdmissionResultSchema,
  bookingQuoteSnapshotSchema,
  bookingSummarySchema,
  rentBoardPageSchema,
  residentProofPageSchema,
  residentProofSchema,
  staffProofPageSchema,
} from '@hsm/contracts';
import { proofFile } from './payment-proof-file.fixture.js';
import { phaseTwoFixture } from './phase-two-fixture.js';
let f: Awaited<ReturnType<typeof phaseTwoFixture>>;
const today = '2026-10-25';
beforeAll(async () => {
  // Proof files below are explicitly pre-scanned fixtures; this suite does not run antivirus.
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
  graceDays: 3,
  lateCharge: { kind: 'disabled' },
  noticeDays: 15,
  earlyCheckout: { kind: 'manual' },
  allowOpenEnded: false,
  customCharges: 'disabled',
};
const bearer = (token: string) => ({ authorization: 'Bearer ' + token });
function send(
  url: string,
  payload: Record<string, unknown>,
  token = f.ownerToken,
  key = randomUUID(),
) {
  return f.application.inject({
    method: 'POST',
    url,
    headers: { ...bearer(token), 'Idempotency-Key': key },
    payload,
  });
}
// The resident's own read, as raw JSON text.
async function own(url: string) {
  return (await f.application.inject({ url, headers: bearer(f.customerAToken) })).body;
}
async function ok(url: string, payload: Record<string, unknown>, token = f.ownerToken) {
  const response = await send(url, payload, token);
  expect(response.statusCode, response.body).toBeLessThan(300);
  return response.json() as unknown;
}
// A checked-in linked resident with one issued rent invoice (Phase 4 → Phase 6 lineage).
// BR-03: one active hostel per Customer; close the previous scenario's Stay directly.
async function releaseCustomer() {
  const active = await f.connection.db
    .select({ id: stays.id })
    .from(stays)
    .where(and(eq(stays.userId, f.customerA), eq(stays.state, 'active')));
  for (const stay of active)
    await f.connection.db.transaction(async (tx) => {
      const ended = new Date(today + 'T11:00:00Z');
      const ends = await tx
        .update(stayAssignments)
        .set({ endedAt: ended })
        .where(and(eq(stayAssignments.stayId, stay.id), isNull(stayAssignments.endedAt)))
        .returning({ id: stayAssignments.id });
      for (const end of ends)
        await tx
          .update(inventoryClaims)
          .set({ releasedAt: ended })
          .where(eq(inventoryClaims.assignmentId, end.id));
      await tx
        .update(stays)
        .set({ state: 'completed', closedAt: ended, version: 2 })
        .where(eq(stays.id, stay.id));
    });
}
async function resident() {
  await releaseCustomer();
  const item = await f.inventory(),
    policyVersionId = randomUUID();
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
  const quote = bookingQuoteSnapshotSchema.parse(
    await ok(`/v1/marketplace/${item.branchId}/quote`, {
      target: { kind: 'bed', roomId: item.roomId, bedId: item.seatId },
      range: { moveInDate: today, moveOutDate: '2026-12-25' },
    }),
  );
  const booking = bookingSummarySchema.parse(
    await ok(
      `/v1/marketplace/${item.branchId}/bookings`,
      { quote, documents: [], permanentAddress: 'Fixture permanent address' },
      f.customerAToken,
    ),
  );
  const stay = bookingAdmissionResultSchema.parse(
    await ok(`/v1/branches/${item.branchId}/stays/bookings/${booking.id}/check-in`, {
      policyVersionId,
      initialBilling: [{ item: 'rent', cadence: 'periodic', periodIndex: 0 }],
    }),
  );
  const [invoice] = await f.connection.db
    .select()
    .from(residentInvoices)
    .where(eq(residentInvoices.stayId, stay.stayId));
  if (!invoice) throw new Error('Invoice missing');
  await ok(`/v1/branches/${item.branchId}/payment-instructions`, {
    method: 'bank_transfer',
    accountTitle: 'Fixture Hostel',
    accountIdentifier: 'PK00FIXTURE000000',
    instructions: null,
  });
  return { item, stay, invoice, rent: quote.price.monthlyRentPaisa };
}
async function submit(
  stayId: string,
  invoiceId: string,
  amountPaisa: number,
  token = f.customerAToken,
) {
  return send(
    `/v1/me/stays/${stayId}/payment-proofs`,
    {
      invoiceId,
      fileId: await proofFile(f),
      amountPaisa,
      method: 'bank_transfer',
      paidOn: today,
      reference: 'TRX-' + randomUUID().slice(0, 8),
    },
    token,
  );
}
it('PAY-001..009 / ACC-004: partial then full payment via reviewed proofs, one receipt each', async () => {
  const { item, stay, invoice, rent } = await resident();
  const destinations = await f.application.inject({
    url: `/v1/me/stays/${stay.stayId}/payment-instructions`,
    headers: bearer(f.customerAToken),
  });
  expect(destinations.statusCode, destinations.body).toBe(200);
  expect(destinations.json()).toMatchObject({
    branchId: item.branchId,
    data: [{ accountTitle: 'Fixture Hostel' }],
  });
  // Another account cannot see this Stay's destinations or submit against it.
  expect(
    (
      await f.application.inject({
        url: `/v1/me/stays/${stay.stayId}/payment-instructions`,
        headers: bearer(f.customerBToken),
      })
    ).statusCode,
  ).toBe(404);
  const half = Math.floor(rent / 2);
  const first = await submit(stay.stayId, invoice.id, half);
  expect(first.statusCode, first.body).toBe(201);
  const pending = residentProofSchema.parse(first.json());
  expect(pending).toMatchObject({ state: 'submitted', paymentId: null, receiptId: null });
  // One open proof per invoice; a submission never posts a payment.
  expect((await submit(stay.stayId, invoice.id, half)).statusCode).toBe(409);
  expect(
    await f.connection.db
      .select()
      .from(residentPayments)
      .where(eq(residentPayments.stayId, stay.stayId)),
  ).toEqual([]);
  const queue = staffProofPageSchema.parse(
    (
      await f.application.inject({
        url: `/v1/branches/${item.branchId}/payment-proofs?state=submitted`,
        headers: bearer(f.ownerToken),
      })
    ).json(),
  );
  expect(queue.data.find((row) => row.proof.id === pending.id)).toMatchObject({
    amountMismatch: true,
    invoiceOutstandingPaisa: rent,
    bedLabel: 'A',
  });
  const link = await f.application.inject({
    url: `/v1/branches/${item.branchId}/payment-proofs/${pending.id}/download`,
    headers: bearer(f.ownerToken),
  });
  expect(link.statusCode, link.body).toBe(200);
  // Double-click and concurrent approvals commit exactly one payment and receipt.
  const review = `/v1/branches/${item.branchId}/payment-proofs/${pending.id}/review`;
  const key = randomUUID();
  const racing = await Promise.all([
    send(review, { decision: 'approve' }, f.ownerToken, key),
    send(review, { decision: 'approve' }, f.ownerToken, key),
    send(review, { decision: 'approve' }),
  ]);
  expect(racing.filter((response) => response.statusCode === 200).length).toBeGreaterThanOrEqual(1);
  expect(racing.every((response) => [200, 409].includes(response.statusCode))).toBe(true);
  const payments = await f.connection.db
    .select()
    .from(residentPayments)
    .where(eq(residentPayments.stayId, stay.stayId));
  expect(payments).toHaveLength(1);
  expect(payments[0]?.amountPaisa).toBe(BigInt(half));
  expect(
    await f.connection.db
      .select()
      .from(residentReceipts)
      .where(eq(residentReceipts.stayId, stay.stayId)),
  ).toHaveLength(1);
  const approved = residentProofPageSchema
    .parse(
      (
        await f.application.inject({
          url: `/v1/me/stays/${stay.stayId}/payment-proofs`,
          headers: bearer(f.customerAToken),
        })
      ).json(),
    )
    .data.find((row) => row.id === pending.id);
  expect(approved).toMatchObject({ state: 'approved', paymentId: payments[0]?.id });
  expect(approved?.receiptId).not.toBeNull();
  const board = async () =>
    rentBoardPageSchema
      .parse(
        (
          await f.application.inject({
            url: `/v1/branches/${item.branchId}/rent-board?month=${invoice.dueDate.slice(0, 7)}`,
            headers: bearer(f.ownerToken),
          })
        ).json(),
      )
      .data.find((row) => row.stayId === stay.stayId);
  expect((await board())?.invoices[0]).toMatchObject({
    allocatedPaisa: half,
    outstandingPaisa: rent - half,
  });
  expect(['partially_paid', 'overdue']).toContain((await board())?.invoices[0]?.state);
  // A second proof pays the exact remainder; any excess is refused.
  expect((await submit(stay.stayId, invoice.id, rent - half + 500)).statusCode).toBe(409);
  const second = residentProofSchema.parse(
    (await submit(stay.stayId, invoice.id, rent - half)).json(),
  );
  const settled = await send(`/v1/branches/${item.branchId}/payment-proofs/${second.id}/review`, {
    decision: 'approve',
  });
  expect(settled.statusCode, settled.body).toBe(200);
  expect((await board())?.invoices[0]).toMatchObject({
    state: 'paid',
    outstandingPaisa: 0,
    allocatedPaisa: rent,
  });
  expect((await board())?.state).toBe('paid');
  expect((await submit(stay.stayId, invoice.id, 100)).statusCode).toBe(409);
  // PAY-009: the resident downloads a real PDF of their own receipt; others cannot.
  const settledProof = residentProofSchema.parse(settled.json());
  const pdfUrl = `/v1/me/stays/${stay.stayId}/receipts/${settledProof.receiptId ?? ''}/pdf`;
  const pdf = await f.application.inject({ url: pdfUrl, headers: bearer(f.customerAToken) });
  expect(pdf.statusCode, pdf.body).toBe(200);
  expect(pdf.headers['content-type']).toContain('application/pdf');
  expect(pdf.rawPayload.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
  expect(pdf.rawPayload.toString('latin1')).toContain('Advance credit: PKR 0');
  expect(
    (await f.application.inject({ url: pdfUrl, headers: bearer(f.customerBToken) })).statusCode,
  ).toBe(404);
  // Q14: the Owner reverses the second payment; the receipt stays, the invoice reopens.
  const reversal = await send(
    `/v1/branches/${item.branchId}/stays/${stay.stayId}/payments/${settledProof.paymentId ?? ''}/reverse`,
    { reason: 'Bank reported the transfer as returned' },
  );
  expect(reversal.statusCode, reversal.body).toBe(201);
  expect((await board())?.invoices[0]).toMatchObject({
    allocatedPaisa: half,
    outstandingPaisa: rent - half,
  });
  const reversed = await f.application.inject({
    url: `/v1/me/stays/${stay.stayId}/receipts/${settledProof.receiptId ?? ''}`,
    headers: bearer(f.customerAToken),
  });
  expect(reversed.json()).toMatchObject({ reversed: true });
});
it('PAY-006 / ACC-002: rejection keeps the invoice unpaid; grants and branch scope are live', async () => {
  const { item, stay, invoice, rent } = await resident();
  const pending = residentProofSchema.parse((await submit(stay.stayId, invoice.id, rent)).json());
  const review = `/v1/branches/${item.branchId}/payment-proofs/${pending.id}/review`;
  expect((await send(review, { decision: 'reject' })).statusCode).toBe(400);
  const foreign = await f.inventory();
  expect(
    (
      await send(`/v1/branches/${foreign.branchId}/payment-proofs/${pending.id}/review`, {
        decision: 'approve',
      })
    ).statusCode,
  ).toBe(404);
  const assignmentId = randomUUID();
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
      .values({ assignmentId, permission: 'finance_view', grantedAt: f.now });
    expect((await send(review, { decision: 'approve' }, f.customerBToken)).statusCode).toBe(403);
    await f.connection.db
      .insert(managerInventoryGrants)
      .values({ assignmentId, permission: 'payment_record', grantedAt: f.now });
    await f.connection.db
      .delete(managerInventoryGrants)
      .where(
        and(
          eq(managerInventoryGrants.assignmentId, assignmentId),
          eq(managerInventoryGrants.permission, 'finance_view'),
        ),
      );
    expect((await send(review, { decision: 'approve' }, f.customerBToken)).statusCode).toBe(403);
  } finally {
    await f.connection.db
      .delete(managerInventoryGrants)
      .where(eq(managerInventoryGrants.assignmentId, assignmentId));
    await f.connection.db
      .update(managerAssignments)
      .set({ status: 'deactivated' })
      .where(eq(managerAssignments.id, assignmentId));
  }
  const rejected = await send(review, {
    decision: 'reject',
    reason: 'Amount not received in the account',
  });
  expect(rejected.statusCode, rejected.body).toBe(200);
  expect(residentProofSchema.parse(rejected.json())).toMatchObject({
    state: 'rejected',
    reviewReason: 'Amount not received in the account',
    paymentId: null,
  });
  expect((await send(review, { decision: 'approve' })).statusCode).toBe(409);
  expect(
    await f.connection.db
      .select()
      .from(residentPayments)
      .where(eq(residentPayments.stayId, stay.stayId)),
  ).toEqual([]);
  // The resident may submit a corrected proof after a rejection.
  expect((await submit(stay.stayId, invoice.id, rent)).statusCode).toBe(201);
  // Another resident cannot submit against this Stay.
  expect((await submit(stay.stayId, invoice.id, rent, f.customerBToken)).statusCode).toBe(404);
});
it('PAY-002 / PAY-008 / CHG-050: one proof pays two bills; approval splits one payment, one receipt', async () => {
  const { item, stay, invoice: first, rent } = await resident();
  // A transport bill on the same Stay, posted the way billing posts it (charge, ledger, bill).
  const transport = 300000;
  const second = { id: randomUUID() };
  await f.connection.db.transaction(async (tx) => {
    const scope = { branchId: item.branchId, stayId: stay.stayId };
    const [agreement] = await tx
      .select({ id: residentCharges.agreementId })
      .from(residentCharges)
      .where(eq(residentCharges.stayId, stay.stayId));
    if (!agreement) throw new Error('Agreement missing');
    const chargeId = randomUUID(),
      at = new Date(today + 'T10:00:00Z');
    await tx.insert(residentCharges).values({
      id: chargeId,
      ...scope,
      agreementId: agreement.id,
      kind: 'transport',
      sourceKey: 'chg-050:' + second.id,
      descriptionSnapshot: 'Transport fixture',
      amountPaisa: BigInt(transport),
      quantity: 1,
      periodStart: today,
      periodEnd: '2026-11-25',
      postedByUserId: f.ownerId,
      postedAt: at,
    });
    await tx.insert(residentLedger).values({
      ...scope,
      chargeId,
      account: 'receivable',
      side: 'debit',
      amountPaisa: BigInt(transport),
      postedAt: at,
    });
    await tx.insert(residentInvoices).values({
      id: second.id,
      ...scope,
      number: 'INV-T-' + second.id.slice(0, 8),
      totalPaisa: BigInt(transport),
      dueDate: '2026-11-10',
      state: 'issued',
      issuedByUserId: f.ownerId,
      issuedAt: at,
    });
    await tx.insert(residentInvoiceCharges).values({ ...scope, invoiceId: second.id, chargeId });
  });
  const pay = (invoiceId: string, also: string[], amountPaisa: number, depositPaisa = 0) =>
    proofFile(f).then((fileId) =>
      send(
        `/v1/me/stays/${stay.stayId}/payment-proofs`,
        {
          invoiceId,
          alsoInvoiceIds: also,
          depositPaisa,
          fileId,
          amountPaisa,
          method: 'bank_transfer',
          paidOn: today,
        },
        f.customerAToken,
      ),
    );
  // Each bill says what it is for, so the resident sees Rent and Transport, not two "Rent".
  const kinds = await own(`/v1/me/stays/${stay.stayId}/invoices`);
  expect(kinds).toMatch(new RegExp(first.id + '[^}]*"kind":"rent"'));
  expect(kinds).toMatch(new RegExp(second.id + '[^}]*"kind":"transport"'));
  // The same bill twice in one proof is refused before anything is stored.
  expect((await pay(first.id, [first.id], rent)).statusCode).toBe(400);
  expect((await pay(first.id, [second.id], rent + transport + 500)).statusCode).toBe(409);
  const combined = await pay(first.id, [second.id], rent + transport + 500, 500);
  expect(combined.statusCode, combined.body).toBe(201);
  const proof = residentProofSchema.parse(combined.json());
  expect(proof.invoices?.map((row) => row.invoiceId)).toEqual([first.id, second.id]);
  // Either bill is now waiting for review, so neither can be paid again meanwhile.
  expect((await pay(second.id, [], transport)).statusCode).toBe(409);
  expect((await pay(first.id, [], rent)).statusCode).toBe(409);
  const queue = staffProofPageSchema.parse(
    (
      await f.application.inject({
        url: `/v1/branches/${item.branchId}/payment-proofs?state=submitted`,
        headers: bearer(f.ownerToken),
      })
    ).json(),
  );
  // Explicit security is separate from both bill balances.
  expect(queue.data.find((row) => row.proof.id === proof.id)).toMatchObject({
    invoiceOutstandingPaisa: rent + transport,
    depositOutstandingPaisa: expect.any(Number),
    amountMismatch: false,
  });
  const board = rentBoardPageSchema.parse(
    (
      await f.application.inject({
        url: `/v1/branches/${item.branchId}/rent-board?month=2026-10`,
        headers: bearer(f.ownerToken),
      })
    ).json(),
  );
  // The second bill (an extra bill of the proof) also reads as proof pending.
  expect(board.data.find((row) => row.stayId === stay.stayId)?.state).toBe('proof_pending');
  const approved = await send(`/v1/branches/${item.branchId}/payment-proofs/${proof.id}/review`, {
    decision: 'approve',
  });
  expect(approved.statusCode, approved.body).toBe(200);
  const payments = await f.connection.db
    .select()
    .from(residentPayments)
    .where(eq(residentPayments.stayId, stay.stayId));
  expect(payments).toHaveLength(1);
  expect(payments[0]?.amountPaisa).toBe(BigInt(rent + transport + 500));
  const receipts = await f.connection.db
    .select()
    .from(residentReceipts)
    .where(eq(residentReceipts.stayId, stay.stayId));
  expect(receipts).toMatchObject([
    { snapshot: { distribution: { depositPaisa: 500, advanceCreditPaisa: 0 } } },
  ]);
  // Both bills are fully paid and security is kept separately; there is no excess credit.
  for (const bill of [first, second]) {
    const invoice = await f.application.inject({
      url: `/v1/me/stays/${stay.stayId}/invoices/${bill.id}`,
      headers: bearer(f.customerAToken),
    });
    expect(invoice.statusCode, invoice.body).toBe(200);
    expect(invoice.json()).toMatchObject({ state: 'paid', outstandingPaisa: 0 });
  }
});
