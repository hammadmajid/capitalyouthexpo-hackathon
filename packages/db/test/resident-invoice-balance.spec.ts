import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { v7 } from 'uuid';
import {
  readResidentInvoiceBalance,
  readResidentInvoiceBalances,
  residentInvoices,
  residentPayments,
  residentReceipts,
  stays,
} from '../src/index.js';
import { inventoryHarness } from './inventory.fixture.js';
import {
  financeScope,
  financeTime,
  postRent,
  issueInvoice,
  receivePayment,
  applyDeposit,
  type FinanceScope,
} from './resident-finance.fixture.js';
import { postCredit } from './resident-finance-balances.fixture.js';
import { reverseRecordedPayment } from './resident-finance-reversal.fixture.js';
const harness = inventoryHarness();
beforeAll(() => harness.start());
afterAll(() => harness.close());
async function fixture() {
  const scope = await financeScope(harness);
  const data = await harness.database().transaction(async (transaction) => {
    const chargeId = await postRent(transaction, scope),
      invoiceId = await issueInvoice(transaction, scope, chargeId);
    return { chargeId, invoiceId };
  });
  return { scope, ...data };
}
function read(scope: FinanceScope, invoiceId: string) {
  return harness.database().transaction(async (transaction) => {
    const balance = await readResidentInvoiceBalance(transaction, {
      branchId: scope.branchId,
      stayId: scope.stayId,
      invoiceId,
      today: '2028-02-01',
    });
    const batch = await readResidentInvoiceBalances(transaction, {
      branchId: scope.branchId,
      today: '2028-02-01',
      invoices: [{ stayId: scope.stayId, invoiceId }],
    });
    expect(batch).toEqual([balance]);
    return balance;
  });
}
it('FIN-001 / PAY-008: real receipt-backed partial/full allocations project exact current invoice status', async () => {
  const { scope, invoiceId } = await fixture();
  expect(await read(scope, invoiceId)).toMatchObject({
    state: 'issued',
    totalPaisa: 1800001,
    allocatedPaisa: 0,
    outstandingPaisa: 1800001,
  });
  await harness.database().transaction((transaction) =>
    receivePayment(transaction, scope, {
      amount: 900000n,
      allocations: [{ invoiceId, amount: 900000n }],
      deposit: 0n,
      advance: 0n,
    }),
  );
  expect(await read(scope, invoiceId)).toMatchObject({
    state: 'partially_paid',
    allocatedPaisa: 900000,
    outstandingPaisa: 900001,
  });
  await harness.database().transaction((transaction) =>
    receivePayment(transaction, scope, {
      amount: 900001n,
      allocations: [{ invoiceId, amount: 900001n }],
      deposit: 0n,
      advance: 0n,
    }),
  );
  expect(await read(scope, invoiceId)).toMatchObject({
    state: 'paid',
    allocatedPaisa: 1800001,
    outstandingPaisa: 0,
  });
  expect(
    await harness
      .database()
      .select()
      .from(residentReceipts)
      .where(eq(residentReceipts.stayId, scope.stayId)),
  ).toHaveLength(2);
});
it('FIN-001 / PAY-008: real waiver and balanced void preserve face value without fabricating a payment or Paid', async () => {
  const { scope, chargeId, invoiceId } = await fixture();
  await harness
    .database()
    .transaction((transaction) => postCredit(transaction, scope, chargeId, 1800001n));
  expect(await read(scope, invoiceId)).toMatchObject({
    state: 'no_charge',
    totalPaisa: 1800001,
    creditAdjustmentsPaisa: 1800001,
    allocatedPaisa: 0,
    outstandingPaisa: 0,
  });
  await harness
    .database()
    .update(residentInvoices)
    .set({
      state: 'voided',
      voidedByUserId: scope.ownerId,
      voidedAt: financeTime,
      voidReason: 'Explicit balanced Owner void',
    })
    .where(eq(residentInvoices.id, invoiceId));
  expect(await read(scope, invoiceId)).toMatchObject({
    state: 'voided',
    totalPaisa: 1800001,
    allocatedPaisa: 0,
    outstandingPaisa: 0,
  });
  expect(
    await harness
      .database()
      .select()
      .from(residentPayments)
      .where(eq(residentPayments.stayId, scope.stayId)),
  ).toHaveLength(0);
});
it('RENT-005 / PAY-008: held deposit leaves the invoice unpaid until a source-linked receipt-backed application commits', async () => {
  const { scope, invoiceId } = await fixture();
  const paymentId = await harness.database().transaction((transaction) =>
    receivePayment(transaction, scope, {
      amount: 1800001n,
      allocations: [],
      deposit: 1800001n,
      advance: 0n,
    }),
  );
  expect(await read(scope, invoiceId)).toMatchObject({
    state: 'issued',
    allocatedPaisa: 0,
    outstandingPaisa: 1800001,
  });
  await harness
    .database()
    .transaction((transaction) => applyDeposit(transaction, scope, paymentId, invoiceId, 1800001n));
  expect(await read(scope, invoiceId)).toMatchObject({
    state: 'paid',
    allocatedPaisa: 1800001,
    outstandingPaisa: 0,
  });
  expect(
    await harness
      .database()
      .select()
      .from(residentReceipts)
      .where(eq(residentReceipts.paymentId, paymentId)),
  ).toHaveLength(1);
});
it('PAY-008 / Q14: actual reversal restores debt through opposite postings and retains the original approved receipt', async () => {
  const { scope, invoiceId } = await fixture();
  const paymentId = await harness.database().transaction((transaction) =>
    receivePayment(transaction, scope, {
      amount: 1800001n,
      allocations: [{ invoiceId, amount: 1800001n }],
      deposit: 0n,
      advance: 0n,
    }),
  );
  expect((await read(scope, invoiceId)).state).toBe('paid');
  await harness
    .database()
    .transaction((transaction) => reverseRecordedPayment(transaction, scope, paymentId));
  expect(await read(scope, invoiceId)).toMatchObject({
    state: 'issued',
    allocatedPaisa: 0,
    outstandingPaisa: 1800001,
  });
  expect(
    await harness
      .database()
      .select()
      .from(residentReceipts)
      .where(eq(residentReceipts.paymentId, paymentId)),
  ).toHaveLength(1);
  expect(
    await harness
      .database()
      .select()
      .from(residentPayments)
      .where(eq(residentPayments.id, paymentId)),
  ).toHaveLength(1);
});
it('AUD-004 / PAY-008: later mandatory caller failure leaves no Paid result and an exact retry can commit', async () => {
  const { scope, invoiceId } = await fixture();
  const payment = {
    amount: 1800001n,
    allocations: [{ invoiceId, amount: 1800001n }],
    deposit: 0n,
    advance: 0n,
  };
  await expect(
    harness.database().transaction(async (transaction) => {
      await receivePayment(transaction, scope, payment);
      throw new Error('Mandatory caller audit fault');
    }),
  ).rejects.toThrow('Mandatory caller audit fault');
  expect(await read(scope, invoiceId)).toMatchObject({
    state: 'issued',
    allocatedPaisa: 0,
    outstandingPaisa: 1800001,
  });
  await harness
    .database()
    .transaction((transaction) => receivePayment(transaction, scope, payment));
  expect((await read(scope, invoiceId)).state).toBe('paid');
});
it('ACC-004 / FIN-001: actual foreign branch/Stay/invoice identifiers return unavailable, never another balance', async () => {
  const own = await fixture(),
    foreign = await fixture();
  await expect(read(own.scope, foreign.invoiceId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(read(foreign.scope, own.invoiceId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(
    read({ ...own.scope, branchId: foreign.scope.branchId }, own.invoiceId),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(read({ ...own.scope, stayId: randomUUID() }, own.invoiceId)).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
});
it('PAY-008 / ACC-003: an unreceipted actual payment cannot commit and cannot change an invoice to Paid', async () => {
  const { scope, invoiceId } = await fixture();
  await expect(
    harness.database().insert(residentPayments).values({
      id: v7(),
      branchId: scope.branchId,
      stayId: scope.stayId,
      sourceKey: 'missing-approved-receipt',
      amountPaisa: 1800001n,
      method: 'cash',
      paidOn: '2028-02-01',
      approvedByUserId: scope.ownerId,
      approvedAt: financeTime,
      note: 'Constraint failure fixture, no receipt',
    }),
  ).rejects.toThrow();
  expect(await read(scope, invoiceId)).toMatchObject({
    state: 'issued',
    allocatedPaisa: 0,
    outstandingPaisa: 1800001,
  });
});

it('FIN-001 / ACC-001: real financial reader retains a shared Stay lock until its transaction ends', async () => {
  const { scope, invoiceId } = await fixture();
  let markReady: (() => void) | undefined, release: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
      markReady = resolve;
    }),
    hold = new Promise<void>((resolve) => {
      release = resolve;
    });
  const reading = harness.database().transaction(async (transaction) => {
    const result = await readResidentInvoiceBalance(transaction, {
      branchId: scope.branchId,
      stayId: scope.stayId,
      invoiceId,
      today: '2028-02-01',
    });
    markReady?.();
    await hold;
    return result;
  });
  const exclusive = () =>
    harness.database().transaction((transaction) =>
      transaction
        .select({ id: stays.id })
        .from(stays)
        .where(and(eq(stays.branchId, scope.branchId), eq(stays.id, scope.stayId)))
        .for('update', { noWait: true }),
    );
  await Promise.race([ready, reading]);
  try {
    await expect(exclusive()).rejects.toThrow();
  } finally {
    release?.();
    await reading;
  }
  expect(await exclusive()).toEqual([{ id: scope.stayId }]);
});
