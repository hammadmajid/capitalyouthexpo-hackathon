import { reverseRecordedPayment } from './resident-finance-reversal.fixture.js';
import { accountBalance, postCredit } from './resident-finance-balances.fixture.js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { v7 } from 'uuid';
import {
  residentCharges,
  residentInvoices,
  residentPayments,
  residentReceipts,
  residentLedger,
  residentFinanceChecks,
} from '../src/index.js';
import { inventoryHarness } from './inventory.fixture.js';
import {
  financeScope,
  financeTime,
  postRent,
  issueInvoice,
  receivePayment,
  applyDeposit,
} from './resident-finance.fixture.js';
const harness = inventoryHarness(),
  database = harness.database;
beforeAll(() => harness.start());
afterAll(() => harness.close());

it('PAY-008 / FIN-001: approved external payment cannot commit without its receipt and complete ledger distribution', async () => {
  const scope = await financeScope(harness);
  await expect(
    database().insert(residentPayments).values({
      id: v7(),
      branchId: scope.branchId,
      stayId: scope.stayId,
      sourceKey: 'missing-receipt',
      amountPaisa: 1000001n,
      method: 'cash',
      paidOn: '2028-02-01',
      approvedByUserId: scope.ownerId,
      approvedAt: financeTime,
      note: 'Missing receipt fixture',
    }),
  ).rejects.toThrow();
  await expect(
    database().transaction((transaction) =>
      receivePayment(transaction, scope, {
        amount: 1000001n,
        allocations: [],
        deposit: 1000000n,
        advance: 0n,
      }),
    ),
  ).rejects.toThrow();
  expect(
    await database()
      .select()
      .from(residentPayments)
      .where(eq(residentPayments.stayId, scope.stayId)),
  ).toHaveLength(0);
  expect(
    await database()
      .select()
      .from(residentReceipts)
      .where(eq(residentReceipts.stayId, scope.stayId)),
  ).toHaveLength(0);
  expect(
    await database().select().from(residentLedger).where(eq(residentLedger.stayId, scope.stayId)),
  ).toHaveLength(0);
});
it('RENT-005 / PAY-008: exact partial invoice payment and unspent deposit/advance retain every paisa separately', async () => {
  const scope = await financeScope(harness);
  await database().transaction(async (transaction) => {
    const charge = await postRent(transaction, scope),
      invoice = await issueInvoice(transaction, scope, charge);
    await receivePayment(transaction, scope, {
      amount: 2000001n,
      allocations: [{ invoiceId: invoice, amount: 1000000n }],
      deposit: 500000n,
      advance: 500001n,
    });
  });
  expect(await accountBalance(database(), scope, 'receivable')).toBe(800001n);
  expect(await accountBalance(database(), scope, 'deposit')).toBe(500000n);
  expect(await accountBalance(database(), scope, 'advance')).toBe(500001n);
  expect(
    await database()
      .select()
      .from(residentReceipts)
      .where(eq(residentReceipts.stayId, scope.stayId)),
  ).toHaveLength(1);
});
it('RENT-003 / ACC-004: invoice face value, charge links and payment allocations cannot mismatch or cross branches', async () => {
  const own = await financeScope(harness),
    foreign = await financeScope(harness);
  const ownCharge = await database().transaction((transaction) => postRent(transaction, own));
  await expect(
    database().transaction((transaction) => issueInvoice(transaction, own, ownCharge, 1n)),
  ).rejects.toThrow();
  await expect(
    database().transaction((transaction) => issueInvoice(transaction, foreign, ownCharge)),
  ).rejects.toThrow();
  const invoice = await database().transaction((transaction) =>
    issueInvoice(transaction, own, ownCharge),
  );
  await expect(
    database().transaction((transaction) =>
      receivePayment(transaction, foreign, {
        amount: 1n,
        allocations: [{ invoiceId: invoice, amount: 1n }],
        deposit: 0n,
        advance: 0n,
      }),
    ),
  ).rejects.toThrow();
  await expect(
    database().transaction((transaction) =>
      receivePayment(transaction, own, {
        amount: 1800002n,
        allocations: [{ invoiceId: invoice, amount: 1800002n }],
        deposit: 0n,
        advance: 0n,
      }),
    ),
  ).rejects.toThrow();
  expect(
    await database().select().from(residentInvoices).where(eq(residentInvoices.stayId, own.stayId)),
  ).toHaveLength(1);
});
it('PAY-008 / ACC-001: concurrent retries of one real payment source create one receipt and one conserved event', async () => {
  const scope = await financeScope(harness);
  const post = () =>
    database().transaction((transaction) =>
      receivePayment(transaction, scope, {
        amount: 1000001n,
        allocations: [],
        deposit: 0n,
        advance: 1000001n,
        key: 'same-source',
      }),
    );
  const results = await Promise.allSettled([post(), post()]);
  expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((row) => row.status === 'rejected')).toHaveLength(1);
  expect(
    await database()
      .select()
      .from(residentReceipts)
      .where(eq(residentReceipts.stayId, scope.stayId)),
  ).toHaveLength(1);
  expect(await accountBalance(database(), scope, 'advance')).toBe(1000001n);
});
it('OUT-004 / ACC-001: concurrent applications cannot spend the same deposit twice', async () => {
  const scope = await financeScope(harness);
  const data = await database().transaction(async (transaction) => {
    const charge = await postRent(transaction, scope),
      invoice = await issueInvoice(transaction, scope, charge);
    const payment = await receivePayment(transaction, scope, {
      amount: 1000001n,
      allocations: [],
      deposit: 1000001n,
      advance: 0n,
    });
    return { invoice, payment };
  });
  const apply = () =>
    database().transaction((transaction) =>
      applyDeposit(transaction, scope, data.payment, data.invoice, 600001n),
    );
  const results = await Promise.allSettled([apply(), apply()]);
  expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((row) => row.status === 'rejected')).toHaveLength(1);
  expect(await accountBalance(database(), scope, 'deposit')).toBe(400000n);
  expect(await accountBalance(database(), scope, 'receivable')).toBe(1200000n);
});
it('RENT-003 / PAY-008 / AUD-004: original charges, approved payments, receipts and postings cannot be rewritten or deleted', async () => {
  const scope = await financeScope(harness);
  const data = await database().transaction(async (transaction) => {
    const charge = await postRent(transaction, scope),
      invoice = await issueInvoice(transaction, scope, charge);
    const payment = await receivePayment(transaction, scope, {
      amount: 1800001n,
      allocations: [{ invoiceId: invoice, amount: 1800001n }],
      deposit: 0n,
      advance: 0n,
    });
    return { charge, payment };
  });
  await expect(
    database()
      .update(residentCharges)
      .set({ amountPaisa: 1n })
      .where(eq(residentCharges.id, data.charge)),
  ).rejects.toThrow();
  await expect(
    database().delete(residentPayments).where(eq(residentPayments.id, data.payment)),
  ).rejects.toThrow();
  await expect(
    database()
      .update(residentReceipts)
      .set({ snapshot: { forged: true } })
      .where(eq(residentReceipts.paymentId, data.payment)),
  ).rejects.toThrow();
  await expect(
    database().delete(residentLedger).where(eq(residentLedger.stayId, scope.stayId)),
  ).rejects.toThrow();
  expect(await accountBalance(database(), scope, 'receivable')).toBe(0n);
});
it('PAY-008 / Q14: explicit reversal retains the original receipt and restores the invoice through linked opposite postings', async () => {
  const scope = await financeScope(harness);
  const payment = await database().transaction(async (transaction) => {
    const charge = await postRent(transaction, scope),
      invoice = await issueInvoice(transaction, scope, charge);
    return receivePayment(transaction, scope, {
      amount: 1800001n,
      allocations: [{ invoiceId: invoice, amount: 1800001n }],
      deposit: 0n,
      advance: 0n,
    });
  });
  await database().transaction((transaction) =>
    reverseRecordedPayment(transaction, scope, payment),
  );
  expect(await accountBalance(database(), scope, 'receivable')).toBe(1800001n);
  expect(
    await database().select().from(residentReceipts).where(eq(residentReceipts.paymentId, payment)),
  ).toHaveLength(1);
  expect(
    await database().select().from(residentPayments).where(eq(residentPayments.id, payment)),
  ).toHaveLength(1);
});

it('RENT-003 / FIN-001: voiding an invoice requires an explicit balancing correction, preserving the original face value', async () => {
  const scope = await financeScope(harness);
  const data = await database().transaction(async (transaction) => {
    const charge = await postRent(transaction, scope),
      invoice = await issueInvoice(transaction, scope, charge);
    return { charge, invoice };
  });
  const voidValues = {
    state: 'voided' as const,
    voidedByUserId: scope.ownerId,
    voidedAt: financeTime,
    voidReason: 'Owner cancelled the issued charge',
  };
  await expect(
    database()
      .update(residentInvoices)
      .set(voidValues)
      .where(eq(residentInvoices.id, data.invoice)),
  ).rejects.toThrow();
  await database().transaction(async (transaction) => {
    await postCredit(transaction, scope, data.charge, 1800001n);
    await transaction
      .update(residentInvoices)
      .set(voidValues)
      .where(eq(residentInvoices.id, data.invoice));
  });
  expect(await accountBalance(database(), scope, 'receivable')).toBe(0n);
  const [original] = await database()
    .select()
    .from(residentInvoices)
    .where(eq(residentInvoices.id, data.invoice));
  expect(original?.totalPaisa).toBe(1800001n);
  expect(original?.state).toBe('voided');
  expect(
    await database()
      .select()
      .from(residentReceipts)
      .where(eq(residentReceipts.stayId, scope.stayId)),
  ).toHaveLength(0);
});

it('PAY-008 / ACC-001: concurrent distinct payments cannot both consume the same final invoice balance', async () => {
  const scope = await financeScope(harness);
  const invoice = await database().transaction(async (transaction) => {
    const charge = await postRent(transaction, scope);
    return issueInvoice(transaction, scope, charge);
  });
  const post = () =>
    database().transaction((transaction) =>
      receivePayment(transaction, scope, {
        amount: 1800001n,
        allocations: [{ invoiceId: invoice, amount: 1800001n }],
        deposit: 0n,
        advance: 0n,
      }),
    );
  const results = await Promise.allSettled([post(), post()]);
  expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((row) => row.status === 'rejected')).toHaveLength(1);
  expect(await accountBalance(database(), scope, 'receivable')).toBe(0n);
  expect(
    await database()
      .select()
      .from(residentReceipts)
      .where(eq(residentReceipts.stayId, scope.stayId)),
  ).toHaveLength(1);
  expect(await database().select().from(residentFinanceChecks)).toHaveLength(0);
  await expect(database().delete(residentFinanceChecks)).rejects.toThrow();
});
