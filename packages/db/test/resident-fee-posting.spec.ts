import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  postAgreedFeePeriod,
  residentCharges,
  residentLedger,
  residentInvoices,
  residentInvoiceCharges,
  residentPayments,
} from '../src/index.js';
import { inventoryHarness } from './inventory.fixture.js';
import { financeScope, financeTime } from './resident-finance.fixture.js';
const harness = inventoryHarness();
beforeAll(() => harness.start());
afterAll(() => harness.close());
const setup = {
  fees: [
    { code: 'mess', cadence: 'monthly', amountPaisa: 3101 },
    { code: 'mess', cadence: 'one_time', amountPaisa: 777 },
  ],
  feeBilling: {
    oneTimeDueOffsetDays: 2,
    monthly: {
      cycle: { kind: 'calendar_month', dueDay: 7 },
      proration: { kind: 'full_period' },
    },
  },
} satisfies NonNullable<Parameters<typeof financeScope>[1]>;
async function counts(branchId: string, stayId: string) {
  const db = harness.database();
  return {
    charges: await db
      .select()
      .from(residentCharges)
      .where(and(eq(residentCharges.branchId, branchId), eq(residentCharges.stayId, stayId))),
    invoices: await db
      .select()
      .from(residentInvoices)
      .where(and(eq(residentInvoices.branchId, branchId), eq(residentInvoices.stayId, stayId))),
    ledger: await db
      .select()
      .from(residentLedger)
      .where(and(eq(residentLedger.branchId, branchId), eq(residentLedger.stayId, stayId))),
    links: await db
      .select()
      .from(residentInvoiceCharges)
      .where(
        and(
          eq(residentInvoiceCharges.branchId, branchId),
          eq(residentInvoiceCharges.stayId, stayId),
        ),
      ),
  };
}
function command(
  scope: Awaited<ReturnType<typeof financeScope>>,
  cadence: 'monthly' | 'one_time' = 'monthly',
) {
  return {
    branchId: scope.branchId,
    stayId: scope.stayId,
    agreementId: scope.agreementId,
    actorUserId: scope.ownerId,
    periodIndex: 0,
    fee: { code: 'mess', cadence },
  };
}
it('FIN-004 / ACC-001: concurrent actual fee transactions retain one exact charge, debit, invoice and link', async () => {
  const scope = await financeScope(harness, setup),
    input = command(scope);
  const result = await Promise.all(
    [1, 2].map(() =>
      harness
        .database()
        .transaction((transaction) => postAgreedFeePeriod(transaction, input, financeTime)),
    ),
  );
  expect(result.map((row) => row.status).sort()).toEqual(['already_posted', 'posted']);
  expect(new Set(result.map((row) => row.invoiceId)).size).toBe(1);
  const rows = await counts(scope.branchId, scope.stayId);
  for (const records of Object.values(rows)) expect(records).toHaveLength(1);
  expect(rows.charges[0]).toMatchObject({
    kind: 'mess',
    amountPaisa: 3101n,
    sourceKey: 'fee:mess:monthly:2028-02-01:2028-03-01',
    agreementId: scope.agreementId,
  });
  expect(rows.ledger[0]).toMatchObject({
    account: 'receivable',
    side: 'debit',
    amountPaisa: 3101n,
  });
  expect(rows.invoices[0]).toMatchObject({
    totalPaisa: 3101n,
    dueDate: '2028-02-07',
    state: 'issued',
  });
  const payments = await harness
    .database()
    .select()
    .from(residentPayments)
    .where(eq(residentPayments.stayId, scope.stayId));
  expect(payments).toHaveLength(0);
});
it('FIN-004: one-time and monthly disclosures of the same category remain distinct and a one-time retry cannot duplicate', async () => {
  const scope = await financeScope(harness, setup),
    input = command(scope, 'one_time');
  const first = await harness
    .database()
    .transaction((transaction) => postAgreedFeePeriod(transaction, input, financeTime));
  const monthly = await harness
    .database()
    .transaction((transaction) => postAgreedFeePeriod(transaction, command(scope), financeTime));
  expect(first.status).toBe('posted');
  expect(monthly.status).toBe('posted');
  const retry = await harness
    .database()
    .transaction((transaction) => postAgreedFeePeriod(transaction, input, financeTime));
  expect(retry.status).toBe('already_posted');
  expect(retry.invoiceId).toBe(first.invoiceId);
  const rows = await counts(scope.branchId, scope.stayId);
  for (const records of Object.values(rows)) expect(records).toHaveLength(2);
  expect(rows.charges.map((row) => row.sourceKey).sort()).toEqual([
    'fee:mess:monthly:2028-02-01:2028-03-01',
    'fee:mess:one_time',
  ]);
  expect(rows.charges.find((row) => row.sourceKey === 'fee:mess:one_time')).toMatchObject({
    amountPaisa: 777n,
    periodStart: null,
    periodEnd: null,
  });
  expect(rows.invoices.find((row) => row.id === first.invoiceId)).toMatchObject({
    dueDate: '2028-02-03',
    totalPaisa: 777n,
  });
});
it('FIN-004 / AUD-004: later mandatory caller failure rolls back every fee source before exact retry', async () => {
  const scope = await financeScope(harness, setup),
    input = command(scope);
  await expect(
    harness.database().transaction(async (transaction) => {
      await postAgreedFeePeriod(transaction, input, financeTime);
      throw new Error('Mandatory caller audit/outbox failure');
    }),
  ).rejects.toThrow('Mandatory caller audit/outbox failure');
  for (const rows of Object.values(await counts(scope.branchId, scope.stayId)))
    expect(rows).toHaveLength(0);
  expect(
    (
      await harness
        .database()
        .transaction((transaction) => postAgreedFeePeriod(transaction, input, financeTime))
    ).status,
  ).toBe('posted');
  for (const rows of Object.values(await counts(scope.branchId, scope.stayId)))
    expect(rows).toHaveLength(1);
});
it('ACC-004 / FIN-004: guessed branch/agreement cannot be substituted into actual fee transactions', async () => {
  const scope = await financeScope(harness, setup),
    foreign = await harness.scope(),
    input = command(scope);
  await expect(
    harness
      .database()
      .transaction((transaction) =>
        postAgreedFeePeriod(transaction, { ...input, branchId: foreign.branchId }, financeTime),
      ),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(
    harness
      .database()
      .transaction((transaction) =>
        postAgreedFeePeriod(transaction, { ...input, agreementId: randomUUID() }, financeTime),
      ),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  for (const rows of Object.values(await counts(scope.branchId, scope.stayId)))
    expect(rows).toHaveLength(0);
});
