import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  managerAssignments,
  managerInventoryGrants,
  residentPayments,
  customerProfiles,
} from '@hsm/db';
import { residentInvoiceBalanceSchema } from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
import { invoiceFixture, approveInvoiceReceipt } from './stay-invoice.fixture.js';
let f: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  f = await phaseTwoFixture(new Date('2026-10-04T10:00:00Z'));
});
afterAll(async () => {
  await f?.close();
});
function headers(token = f.ownerToken) {
  return { authorization: 'Bearer ' + token };
}
function staff(item: Awaited<ReturnType<typeof invoiceFixture>>, token = f.ownerToken) {
  return f.application.inject({
    url: '/v1/branches/' + item.branchId + '/stays/' + item.stayId + '/invoices/' + item.invoiceId,
    headers: headers(token),
  });
}
function own(item: Awaited<ReturnType<typeof invoiceFixture>>, token = f.customerAToken) {
  return f.application.inject({
    url: '/v1/me/stays/' + item.stayId + '/invoices/' + item.invoiceId,
    headers: headers(token),
  });
}
it('FIN-001 / RES-001: real Owner and linked account receive exact agreed receipt-backed financial facts with no private identity data', async () => {
  const item = await invoiceFixture(f);
  for (const response of [await staff(item), await own(item)]) {
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(residentInvoiceBalanceSchema.parse(response.json())).toMatchObject({
      invoiceId: item.invoiceId,
      currency: 'PKR',
      totalPaisa: 1800001,
      allocatedPaisa: 0,
      outstandingPaisa: 1800001,
      state: 'issued',
      graceDays: 2,
      dueDate: '2026-10-05',
    });
    expect(response.body).not.toContain('Private invoice resident');
    expect(response.body).not.toContain('cnic');
  }
});
it('ACC-002 / FIN-001: actual Manager requires finance_view and loses access immediately on deactivation', async () => {
  const item = await invoiceFixture(f),
    other = await invoiceFixture(f),
    assignmentId = randomUUID();
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
    .values({ assignmentId, permission: 'stay_manage' });
  expect((await staff(item, f.customerBToken)).statusCode).toBe(403);
  await f.connection.db
    .insert(managerInventoryGrants)
    .values({ assignmentId, permission: 'finance_view' });
  expect((await staff(item, f.customerBToken)).statusCode).toBe(200);
  expect((await staff(other, f.customerBToken)).statusCode).toBe(403);
  await f.connection.db
    .update(managerAssignments)
    .set({ status: 'deactivated' })
    .where(eq(managerAssignments.id, assignmentId));
  expect((await staff(item, f.customerBToken)).statusCode).toBe(403);
});
it('SEC-003 / ACC-004: actual foreign/unlinked Stay and invoice identifiers stay unavailable', async () => {
  const ownItem = await invoiceFixture(f),
    foreign = await invoiceFixture(f, f.customerB),
    offline = await invoiceFixture(f, null);
  expect((await own(foreign)).statusCode).toBe(404);
  expect((await own(offline)).statusCode).toBe(404);
  expect((await own({ ...ownItem, invoiceId: foreign.invoiceId })).statusCode).toBe(404);
  expect((await staff({ ...ownItem, invoiceId: foreign.invoiceId })).statusCode).toBe(404);
  expect((await staff({ ...foreign, branchId: ownItem.branchId })).statusCode).toBe(404);
  expect((await staff(ownItem, f.customerAToken)).statusCode).toBe(403);
});
it('PAY-008 / FIN-001: incomplete approved payment cannot commit or invent Paid; an actual matching receipt and credit permits Paid', async () => {
  const item = await invoiceFixture(f);
  const work = f.connection.db
    .insert(residentPayments)
    .values({
      branchId: item.branchId,
      stayId: item.stayId,
      sourceKey: 'fixture:' + randomUUID(),
      amountPaisa: 1800001n,
      method: 'cash',
      paidOn: '2026-10-04',
      approvedByUserId: f.ownerId,
      approvedAt: f.now,
      note: 'Intentionally incomplete fixture',
    })
    .then((value) => value)
    .catch((error: unknown) => {
      throw error instanceof Error && error.cause instanceof Error ? error.cause : error;
    });
  await expect(work).rejects.toMatchObject({
    code: '23514',
    message: 'Approved payment requires complete ledger and receipt',
  });
  const before = await own(item);
  expect(before.statusCode).toBe(200);
  expect(residentInvoiceBalanceSchema.parse(before.json())).toMatchObject({
    state: 'issued',
    allocatedPaisa: 0,
    outstandingPaisa: 1800001,
  });
  await approveInvoiceReceipt(f, item);
  const after = await own(item);
  expect(after.statusCode).toBe(200);
  expect(residentInvoiceBalanceSchema.parse(after.json())).toMatchObject({
    state: 'paid',
    allocatedPaisa: 1800001,
    outstandingPaisa: 0,
  });
});
it('RES-001 / SEC-003: linked own financial reads survive unrelated profile absence and reject client financial overrides', async () => {
  const item = await invoiceFixture(f);
  await f.connection.db.delete(customerProfiles).where(eq(customerProfiles.userId, f.customerA));
  expect((await own(item)).statusCode).toBe(200);
  const response = await f.application.inject({
    url:
      '/v1/me/stays/' +
      item.stayId +
      '/invoices/' +
      item.invoiceId +
      '?today=1900-01-01&state=paid',
    headers: headers(f.customerAToken),
  });
  expect(response.statusCode).toBe(400);
});
