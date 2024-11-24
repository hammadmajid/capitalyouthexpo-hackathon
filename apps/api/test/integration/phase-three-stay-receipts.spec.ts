import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  managerAssignments,
  managerInventoryGrants,
  residentReceipts,
  customerProfiles,
} from '@hsm/db';
import { residentReceiptDetailSchema } from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
import { invoiceFixture, approveInvoiceReceipt } from './stay-invoice.fixture.js';
let f: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  f = await phaseTwoFixture(new Date('2026-10-04T10:00:00Z'));
});
afterAll(async () => {
  await f?.close();
});
async function prepare(userId?: string | null) {
  const item = await invoiceFixture(f, userId);
  await approveInvoiceReceipt(f, item);
  const [receipt] = await f.connection.db
    .select()
    .from(residentReceipts)
    .where(
      and(eq(residentReceipts.branchId, item.branchId), eq(residentReceipts.stayId, item.stayId)),
    )
    .limit(1);
  if (!receipt) throw new Error('Actual receipt fixture missing');
  return { ...item, receipt };
}
type Item = Awaited<ReturnType<typeof prepare>>;
function staff(item: Item, token = f.ownerToken) {
  return f.application.inject({
    url: '/v1/branches/' + item.branchId + '/stays/' + item.stayId + '/receipts/' + item.receipt.id,
    headers: { authorization: 'Bearer ' + token },
  });
}
function own(item: Item, token = f.customerAToken) {
  return f.application.inject({
    url: '/v1/me/stays/' + item.stayId + '/receipts/' + item.receipt.id,
    headers: { authorization: 'Bearer ' + token },
  });
}
it('FIN-001 / PAY-008: real Owner and explicitly linked account receive immutable receipt facts with no-store', async () => {
  const item = await prepare();
  for (const response of [await staff(item), await own(item)]) {
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(residentReceiptDetailSchema.parse(response.json())).toEqual({
      receiptId: item.receipt.id,
      receiptNumber: item.receipt.number,
      issuedAt: item.receipt.issuedAt.toISOString(),
      snapshot: item.receipt.snapshot,
      reversed: false,
    });
    expect(response.body).not.toContain('proofFileId');
    expect(response.body).not.toContain('cnic');
    expect(response.body).not.toContain('Approved external receipt read fixture');
  }
});
it('ACC-002 / SEC-003: actual Manager requires finance_view and immediately loses receipt access on deactivation', async () => {
  const item = await prepare(),
    other = await prepare(),
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
    .values({ assignmentId, permission: 'payment_record' });
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
it('SEC-003: actual foreign/unlinked receipt children never reveal historical party identity', async () => {
  const item = await prepare(),
    foreign = await prepare(f.customerB),
    offline = await prepare(null);
  expect((await own(foreign)).statusCode).toBe(404);
  expect((await own(offline)).statusCode).toBe(404);
  expect((await own({ ...item, receipt: foreign.receipt })).statusCode).toBe(404);
  expect((await staff({ ...item, receipt: foreign.receipt })).statusCode).toBe(404);
  expect((await staff({ ...foreign, branchId: item.branchId })).statusCode).toBe(404);
  expect((await staff(item, f.customerAToken)).statusCode).toBe(403);
});
it('RES-001 / SEC-003: real receipt reads use account linkage without requiring unrelated Customer profile and reject extra disclosure queries', async () => {
  const item = await prepare();
  await f.connection.db.delete(customerProfiles).where(eq(customerProfiles.userId, f.customerA));
  expect((await own(item)).statusCode).toBe(200);
  const response = await f.application.inject({
    url: '/v1/me/stays/' + item.stayId + '/receipts/' + item.receipt.id + '?includeProof=true',
    headers: { authorization: 'Bearer ' + f.customerAToken },
  });
  expect(response.statusCode).toBe(400);
});
