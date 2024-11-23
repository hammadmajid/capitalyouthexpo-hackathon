import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  hostelAuditLog,
  managerAssignments,
  managerInventoryGrants,
  postAgreedRentPeriod,
  residentChargeAdjustments,
  residentCharges,
  residentInvoiceCharges,
  residentInvoices,
} from '@hsm/db';
import { invoiceReissueResultSchema } from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
import { invoiceFixture, approveInvoiceReceipt } from './stay-invoice.fixture.js';
let f: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  f = await phaseTwoFixture(new Date('2026-10-04T10:00:00Z'));
});
afterAll(async () => {
  await f?.close();
});
type Item = Awaited<ReturnType<typeof invoiceFixture>>;
function reissue(item: Item, payload: unknown, token = f.ownerToken, key = randomUUID()) {
  return f.application.inject({
    method: 'POST',
    url: `/v1/branches/${item.branchId}/stays/${item.stayId}/invoices/${item.invoiceId}/reissue`,
    headers: { authorization: 'Bearer ' + token, 'Idempotency-Key': key },
    payload: payload as Record<string, unknown>,
  });
}
function balance(item: Item, invoiceId: string) {
  return f.application.inject({
    url: `/v1/branches/${item.branchId}/stays/${item.stayId}/invoices/${invoiceId}`,
    headers: { authorization: 'Bearer ' + f.ownerToken },
  });
}
async function chargeOf(invoiceId: string) {
  const [row] = await f.connection.db
    .select({ charge: residentCharges })
    .from(residentInvoiceCharges)
    .innerJoin(residentCharges, eq(residentCharges.id, residentInvoiceCharges.chargeId))
    .where(eq(residentInvoiceCharges.invoiceId, invoiceId));
  if (!row) throw new Error('Charge missing');
  return row.charge;
}
it('CHG-053 / RENT-003: Owner cancels an unpaid bill and reissues it with the corrected due date', async () => {
  const item = await invoiceFixture(f),
    original = await chargeOf(item.invoiceId),
    dueDate = original.periodStart ?? '2026-10-10',
    key = randomUUID();
  const early = await reissue(item, { dueDate: '2020-01-01', reason: 'Wrong due date' });
  expect(early.statusCode, early.body).toBe(400);
  const first = await reissue(item, { dueDate, reason: 'Due before move-in' }, f.ownerToken, key);
  expect(first.statusCode, first.body).toBe(201);
  const result = invoiceReissueResultSchema.parse(first.json());
  expect(result.voidedInvoiceId).toBe(item.invoiceId);
  const replay = await reissue(item, { dueDate, reason: 'Due before move-in' }, f.ownerToken, key);
  expect(replay.headers['idempotency-replayed']).toBe('true');
  expect(replay.json()).toEqual(result);
  const [voided] = await f.connection.db
    .select()
    .from(residentInvoices)
    .where(eq(residentInvoices.id, item.invoiceId));
  expect(voided).toMatchObject({ state: 'voided', voidReason: 'Due before move-in' });
  const [fresh] = await f.connection.db
    .select()
    .from(residentInvoices)
    .where(eq(residentInvoices.id, result.invoiceId));
  expect(fresh).toMatchObject({ state: 'issued', dueDate, totalPaisa: original.amountPaisa });
  const copy = await chargeOf(result.invoiceId);
  expect(copy).toMatchObject({
    kind: original.kind,
    amountPaisa: original.amountPaisa,
    periodStart: original.periodStart,
    periodEnd: original.periodEnd,
  });
  expect(copy.sourceKey.startsWith('reissue:')).toBe(true);
  const [credit] = await f.connection.db
    .select()
    .from(residentChargeAdjustments)
    .where(eq(residentChargeAdjustments.chargeId, original.id));
  expect(credit).toMatchObject({ kind: 'correction', side: 'credit' });
  const old = await balance(item, item.invoiceId);
  expect(old.json()).toMatchObject({ state: 'voided', outstandingPaisa: 0 });
  const next = await balance(item, result.invoiceId);
  expect(next.json()).toMatchObject({ outstandingPaisa: Number(original.amountPaisa) });
  const audit = await f.connection.db
    .select()
    .from(hostelAuditLog)
    .where(
      and(
        eq(hostelAuditLog.action, 'resident.invoice.reissued'),
        eq(hostelAuditLog.targetId, result.invoiceId),
      ),
    );
  expect(audit).toHaveLength(1);
  // A cancelled bill cannot be cancelled again.
  expect((await reissue(item, { dueDate, reason: 'Again' })).statusCode).toBe(409);
});
it('CHG-053: rerunning the same rent period after a reissue posts nothing new', async () => {
  const item = await invoiceFixture(f),
    { periodStart } = await chargeOf(item.invoiceId);
  const response = await reissue(item, {
    dueDate: periodStart ?? '2026-10-10',
    reason: 'Wrong date',
  });
  expect(response.statusCode, response.body).toBe(201);
  const [stay] = await f.connection.db
    .select({ agreementId: residentCharges.agreementId })
    .from(residentCharges)
    .where(eq(residentCharges.stayId, item.stayId))
    .limit(1);
  const again = await f.connection.db.transaction((tx) =>
    postAgreedRentPeriod(
      tx,
      {
        branchId: item.branchId,
        stayId: item.stayId,
        agreementId: stay?.agreementId ?? '',
        actorUserId: f.ownerId,
        periodIndex: 0,
      },
      f.now,
    ),
  );
  expect(again.status).toBe('already_posted');
});
it('CHG-053: a paid bill is refused; a Manager, even with payment grants, cannot cancel', async () => {
  const paid = await invoiceFixture(f);
  await approveInvoiceReceipt(f, paid);
  const refused = await reissue(paid, { dueDate: '2026-10-10', reason: 'Wrong' });
  expect(refused.statusCode, refused.body).toBe(409);
  const item = await invoiceFixture(f),
    assignmentId = randomUUID();
  await f.connection.db.insert(managerAssignments).values({
    id: assignmentId,
    userId: f.customerB,
    branchId: item.branchId,
    status: 'active',
    appointedByUserId: f.ownerId,
    activatedAt: f.now,
  });
  await f.connection.db.insert(managerInventoryGrants).values([
    { assignmentId, permission: 'payment_record' },
    { assignmentId, permission: 'finance_view' },
  ]);
  const manager = await reissue(item, { dueDate: '2026-10-10', reason: 'Wrong' }, f.customerBToken);
  expect(manager.statusCode, manager.body).toBe(403);
  expect((await reissue(item, { dueDate: '2026-10-10', reason: '' })).statusCode).toBe(400);
});
