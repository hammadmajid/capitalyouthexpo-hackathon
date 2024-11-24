import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  managerAssignments,
  managerInventoryGrants,
  stayAgreements,
  postAgreedRentPeriod,
  hostelAuditLog,
} from '@hsm/db';
import { stayInvoiceReferencePageSchema } from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
import { invoiceFixture } from './stay-invoice.fixture.js';
let f: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  f = await phaseTwoFixture(new Date('2026-10-04T10:00:00Z'));
});
afterAll(async () => {
  await f?.close();
});
type Item = Awaited<ReturnType<typeof invoiceFixture>>;
function staff(item: Item, token = f.ownerToken, query = '') {
  return f.application.inject({
    url: '/v1/branches/' + item.branchId + '/stays/' + item.stayId + '/invoices' + query,
    headers: { authorization: 'Bearer ' + token },
  });
}
function own(item: Item, token = f.customerAToken, query = '') {
  return f.application.inject({
    url: '/v1/me/stays/' + item.stayId + '/invoices' + query,
    headers: { authorization: 'Bearer ' + token },
  });
}
async function additionalInvoice(item: Item) {
  return f.connection.db.transaction(async (tx) => {
    const [agreement] = await tx
      .select()
      .from(stayAgreements)
      .where(eq(stayAgreements.stayId, item.stayId));
    if (!agreement) throw Error('Real agreement missing');
    const result = await postAgreedRentPeriod(
      tx,
      {
        branchId: item.branchId,
        stayId: item.stayId,
        agreementId: agreement.id,
        actorUserId: f.ownerId,
        periodIndex: 1,
      },
      f.now,
    );
    if (!result.invoiceId) throw Error('Second genuine invoice missing');
    await tx.insert(hostelAuditLog).values({
      organizationId: f.organizationId,
      branchId: item.branchId,
      actorUserId: f.ownerId,
      actorRole: 'owner',
      action: 'rent.posted',
      targetType: 'stay',
      targetId: item.stayId,
      after: result,
    });
    return result.invoiceId;
  });
}
it('FIN-001 / ACC-004: real SQL keyset pages contain only exact scoped immutable invoice references', async () => {
  const item = await invoiceFixture(f, f.customerA, '2026-12-01'),
    second = await additionalInvoice(item);
  const expected = [item.invoiceId, second].sort();
  for (const read of [staff, own]) {
    const first = await read(item, undefined, '?limit=1');
    expect(first.statusCode).toBe(200);
    expect(first.headers['cache-control']).toBe('no-store');
    const page = stayInvoiceReferencePageSchema.parse(first.json());
    expect(page).toMatchObject({
      branchId: item.branchId,
      stayId: item.stayId,
      nextCursor: expected[0],
    });
    expect(page.data.map((row) => row.invoiceId)).toEqual(expected.slice(0, 1));
    const next = await read(item, undefined, '?limit=1&cursor=' + page.nextCursor);
    const last = stayInvoiceReferencePageSchema.parse(next.json());
    expect(next.statusCode).toBe(200);
    expect(last.data.map((row) => row.invoiceId)).toEqual(expected.slice(1));
    expect(last.nextCursor).toBeNull();
    const empty = await read(item, undefined, '?limit=1&cursor=' + expected[1]);
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toMatchObject({ data: [], nextCursor: null });
    expect(first.body).not.toContain('Private invoice resident');
    expect(first.body).not.toContain('totalPaisa');
    expect(first.body).not.toContain('approvedByUserId');
    expect(first.body).not.toContain('cnic');
  }
});
it('SEC-003 / ACC-004: actual Manager requires current finance_view and loses the list on revocation', async () => {
  const item = await invoiceFixture(f),
    foreign = await invoiceFixture(f),
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
  expect((await staff(foreign, f.customerBToken)).statusCode).toBe(403);
  await f.connection.db
    .delete(managerInventoryGrants)
    .where(eq(managerInventoryGrants.assignmentId, assignmentId));
  expect((await staff(item, f.customerBToken)).statusCode).toBe(403);
});
it('SEC-003: real foreign/unlinked accounts and cross-branch target identifiers cannot enumerate invoices', async () => {
  const item = await invoiceFixture(f),
    foreign = await invoiceFixture(f, f.customerB),
    offline = await invoiceFixture(f, null);
  expect((await own(foreign)).statusCode).toBe(404);
  expect((await own(offline)).statusCode).toBe(404);
  expect((await staff({ ...item, stayId: foreign.stayId })).statusCode).toBe(404);
  expect((await staff(item, f.customerAToken)).statusCode).toBe(403);
});
it('CHG-012 / RES-001: real explicit own linkage needs no separate Customer profile or customer-role inference', async () => {
  const item = await invoiceFixture(f, f.ownerId);
  expect((await own(item, f.ownerToken)).statusCode).toBe(200);
  expect((await own(item, f.customerAToken)).statusCode).toBe(404);
});
it('SEC-003: real query boundaries and authentication reject without fabricated empty success', async () => {
  const item = await invoiceFixture(f);
  for (const read of [staff, own])
    for (const query of [
      '?limit=0',
      '?limit=101',
      '?cursor=bad',
      '?userId=' + f.customerB,
      '?paid=true',
    ]) {
      expect((await read(item, undefined, query)).statusCode).toBe(400);
    }
  const response = await f.application.inject({ url: '/v1/me/stays/' + item.stayId + '/invoices' });
  expect(response.statusCode).toBe(401);
});
