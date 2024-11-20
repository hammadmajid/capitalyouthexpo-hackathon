import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  postAgreedRentPeriod,
  residentCharges,
  residentInvoices,
  residentInvoiceCharges,
  residentLedger,
} from '../src/index.js';
import { inventoryHarness } from './inventory.fixture.js';
import { financeScope, financeTime } from './resident-finance.fixture.js';
const harness = inventoryHarness();
beforeAll(() => harness.start());
afterAll(() => harness.close());
async function counts(branchId: string, stayId: string) {
  const database = harness.database();
  return {
    charges: await database
      .select()
      .from(residentCharges)
      .where(and(eq(residentCharges.branchId, branchId), eq(residentCharges.stayId, stayId))),
    invoices: await database
      .select()
      .from(residentInvoices)
      .where(and(eq(residentInvoices.branchId, branchId), eq(residentInvoices.stayId, stayId))),
    links: await database
      .select()
      .from(residentInvoiceCharges)
      .where(
        and(
          eq(residentInvoiceCharges.branchId, branchId),
          eq(residentInvoiceCharges.stayId, stayId),
        ),
      ),
    ledger: await database
      .select()
      .from(residentLedger)
      .where(and(eq(residentLedger.branchId, branchId), eq(residentLedger.stayId, stayId))),
  };
}
it('RENT-003 / FIN-001 / ACC-001: concurrent actual transactions post one exact rent charge, debit and issued invoice', async () => {
  const scope = await financeScope(harness),
    command = {
      branchId: scope.branchId,
      stayId: scope.stayId,
      agreementId: scope.agreementId,
      actorUserId: scope.ownerId,
      periodIndex: 0,
    };
  const results = await Promise.all(
    [1, 2].map(() =>
      harness
        .database()
        .transaction((transaction) => postAgreedRentPeriod(transaction, command, financeTime)),
    ),
  );
  expect(results.map((row) => row.status).sort()).toEqual(['already_posted', 'posted']);
  expect(new Set(results.map((row) => row.invoiceId)).size).toBe(1);
  const rows = await counts(scope.branchId, scope.stayId);
  expect(rows.charges).toHaveLength(1);
  expect(rows.invoices).toHaveLength(1);
  expect(rows.links).toHaveLength(1);
  expect(rows.ledger).toHaveLength(1);
  expect(rows.charges[0]).toMatchObject({
    amountPaisa: 1800001n,
    sourceKey: 'rent:2028-02-01:2028-03-01',
    agreementId: scope.agreementId,
  });
  expect(rows.ledger[0]).toMatchObject({
    account: 'receivable',
    side: 'debit',
    amountPaisa: 1800001n,
  });
  expect(rows.invoices[0]).toMatchObject({
    totalPaisa: 1800001n,
    state: 'issued',
    dueDate: '2028-02-05',
  });
});
it('FIN-001 / AUD-004: a later mandatory command failure rolls the complete actual posting back before retry', async () => {
  const scope = await financeScope(harness),
    command = {
      branchId: scope.branchId,
      stayId: scope.stayId,
      agreementId: scope.agreementId,
      actorUserId: scope.ownerId,
      periodIndex: 0,
    };
  await expect(
    harness.database().transaction(async (transaction) => {
      await postAgreedRentPeriod(transaction, command, financeTime);
      throw new Error('Mandatory caller audit/outbox failure');
    }),
  ).rejects.toThrow('Mandatory caller audit/outbox failure');
  const empty = await counts(scope.branchId, scope.stayId);
  for (const rows of Object.values(empty)) expect(rows).toHaveLength(0);
  const retry = await harness
    .database()
    .transaction((transaction) => postAgreedRentPeriod(transaction, command, financeTime));
  expect(retry.status).toBe('posted');
  const posted = await counts(scope.branchId, scope.stayId);
  for (const rows of Object.values(posted)) expect(rows).toHaveLength(1);
});
it('ACC-004 / RENT-003: exact branch/Stay and agreement identity cannot be replaced by guessed identifiers', async () => {
  const scope = await financeScope(harness),
    other = await harness.scope();
  const command = {
    branchId: scope.branchId,
    stayId: scope.stayId,
    agreementId: scope.agreementId,
    actorUserId: scope.ownerId,
    periodIndex: 0,
  };
  await expect(
    harness
      .database()
      .transaction((transaction) =>
        postAgreedRentPeriod(transaction, { ...command, branchId: other.branchId }, financeTime),
      ),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(
    harness
      .database()
      .transaction((transaction) =>
        postAgreedRentPeriod(transaction, { ...command, agreementId: randomUUID() }, financeTime),
      ),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  const empty = await counts(scope.branchId, scope.stayId);
  for (const rows of Object.values(empty)) expect(rows).toHaveLength(0);
});
