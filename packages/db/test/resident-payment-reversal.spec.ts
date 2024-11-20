import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import {
  residentPaymentReversals,
  residentPayments,
  residentReceipts,
  residentLedger,
  hostelAuditLog,
  readResidentInvoiceBalance,
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
import { reverseResidentPayment } from '../src/resident-payment-reversal.js';
import { readResidentReceipt } from '../src/resident-receipt.js';
const harness = inventoryHarness();
beforeAll(() => harness.start());
afterAll(() => harness.close());
async function prepare() {
  const f = await financeScope(harness);
  const data = await harness.database().transaction(async (tx) => {
    const charge = await postRent(tx, f),
      invoiceId = await issueInvoice(tx, f, charge),
      paymentId = await receivePayment(tx, f, {
        amount: 1801502n,
        allocations: [{ invoiceId, amount: 1800001n }],
        deposit: 1001n,
        advance: 500n,
      });
    return { invoiceId, paymentId };
  });
  return { ...f, ...data };
}
function command(f: Awaited<ReturnType<typeof prepare>>) {
  return {
    scope: { branchId: f.branchId, stayId: f.stayId, actorUserId: f.ownerId, actorRole: 'owner' },
    paymentId: f.paymentId,
    reversal: { reason: 'Owner corrected wrong externally recorded receipt' },
  };
}
function run(input: unknown) {
  return harness.database().transaction((tx) => reverseResidentPayment(tx, input, financeTime));
}
async function reversals(stayId: string) {
  return harness
    .database()
    .select()
    .from(residentPaymentReversals)
    .where(eq(residentPaymentReversals.stayId, stayId));
}
it('Q14 / PAY-008 / AUD-004: actual Owner reversal retains receipt/payment and restores invoice through exact opposite postings', async () => {
  const f = await prepare(),
    [receipt] = await harness
      .database()
      .select()
      .from(residentReceipts)
      .where(eq(residentReceipts.paymentId, f.paymentId));
  if (!receipt) throw Error('Receipt fixture missing');
  const result = await run(command(f));
  expect(result).toMatchObject({ paymentId: f.paymentId, receiptId: receipt.id });
  expect(
    await harness
      .database()
      .select()
      .from(residentPayments)
      .where(eq(residentPayments.id, f.paymentId)),
  ).toHaveLength(1);
  const [after] = await harness
    .database()
    .select()
    .from(residentReceipts)
    .where(eq(residentReceipts.id, receipt.id));
  expect(after).toEqual(receipt);
  await expectReversalEntries(f, result.reversalId);
  const invoice = await harness.database().transaction((tx) =>
    readResidentInvoiceBalance(tx, {
      branchId: f.branchId,
      stayId: f.stayId,
      invoiceId: f.invoiceId,
      today: '2028-02-01',
    }),
  );
  expect(invoice).toMatchObject({ state: 'issued', allocatedPaisa: 0, outstandingPaisa: 1800001 });
  const historical = await harness
    .database()
    .transaction((tx) =>
      readResidentReceipt(tx, { branchId: f.branchId, stayId: f.stayId, receiptId: receipt.id }),
    );
  expect(historical).toMatchObject({ reversed: true, snapshot: receipt.snapshot });
  await expectReversalAudit(f, result.reversalId);
});
it('ACC-001 / Q14: actual competing reversal requests append one complete reversal only', async () => {
  const f = await prepare(),
    outcomes = await Promise.allSettled([run(command(f)), run(command(f))]);
  expect(outcomes.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
  expect(outcomes).toContainEqual(
    expect.objectContaining({
      status: 'rejected',
      reason: expect.objectContaining({ code: 'CONFLICT', message: 'Payment already reversed' }),
    }),
  );
  expect(await reversals(f.stayId)).toHaveLength(1);
});
it('RENT-005: actual spent deposit cannot be silently reversed or covered from another payment', async () => {
  const f = await prepare();
  await harness.database().transaction(async (tx) => {
    const charge = await postRent(tx, f, 100n, 'additional-source'),
      invoice = await issueInvoice(tx, f, charge, 100n);
    await applyDeposit(tx, f, f.paymentId, invoice, 100n);
    await receivePayment(tx, f, {
      amount: 100n,
      allocations: [],
      deposit: 100n,
      advance: 0n,
      key: 'other:' + randomUUID(),
    });
  });
  await expect(run(command(f))).rejects.toMatchObject({
    code: 'CONFLICT',
    message: 'Resolve spent deposit or advance before reversing payment',
  });
  expect(await reversals(f.stayId)).toEqual([]);
});
it('SEC-003: actual foreign funding source remains404 under an authorized Stay', async () => {
  const f = await prepare(),
    foreign = await prepare();
  await expect(run({ ...command(f), paymentId: foreign.paymentId })).rejects.toMatchObject({
    code: 'NOT_FOUND',
    status: 404,
  });
  expect(await reversals(f.stayId)).toEqual([]);
});
it('Q14: internal Manager-attributed reversal is rejected before financial writes', async () => {
  const f = await prepare(),
    input = command(f);
  await expect(
    run({ ...input, scope: { ...input.scope, actorRole: 'manager' } }),
  ).rejects.toThrow();
  expect(await reversals(f.stayId)).toEqual([]);
});
it('AUD-004 / ACC-004: actual mandatory reversal audit failure rolls back source/entries and clean retry preserves history', async () => {
  const f = await prepare();
  await harness
    .database()
    .execute(
      sql`create function hsm_test_reversal_audit_failure() returns trigger language plpgsql as $$ begin if NEW.action = 'resident.payment.reversed' then raise exception 'Fixture reversal audit failure' using errcode='P0001'; end if; return NEW; end; $$`,
    );
  await harness
    .database()
    .execute(
      sql`create trigger hsm_test_reversal_audit_failure before insert on hostel_audit_log for each row execute function hsm_test_reversal_audit_failure()`,
    );
  try {
    await expect(run(command(f))).rejects.toThrow();
    expect(await reversals(f.stayId)).toEqual([]);
    const inverse = await harness
      .database()
      .select()
      .from(residentLedger)
      .where(
        and(
          eq(residentLedger.stayId, f.stayId),
          sql`${residentLedger.paymentReversalId} is not null`,
        ),
      );
    expect(inverse).toEqual([]);
  } finally {
    await harness
      .database()
      .execute(sql`drop trigger if exists hsm_test_reversal_audit_failure on hostel_audit_log`);
    await harness
      .database()
      .execute(sql`drop function if exists hsm_test_reversal_audit_failure()`);
  }
  expect(await run(command(f))).toMatchObject({ paymentId: f.paymentId });
});

async function expectReversalEntries(f: Awaited<ReturnType<typeof prepare>>, reversalId: string) {
  const original = await harness
      .database()
      .select()
      .from(residentLedger)
      .where(eq(residentLedger.paymentId, f.paymentId)),
    opposite = await harness
      .database()
      .select()
      .from(residentLedger)
      .where(eq(residentLedger.paymentReversalId, reversalId));
  expect(opposite).toHaveLength(original.length);
  for (const row of original)
    expect(opposite).toContainEqual(
      expect.objectContaining({
        reversedEntryId: row.id,
        account: row.account,
        amountPaisa: row.amountPaisa,
        side: 'debit',
        invoiceId: row.invoiceId,
        fundingPaymentId: f.paymentId,
      }),
    );
}
async function expectReversalAudit(f: Awaited<ReturnType<typeof prepare>>, reversalId: string) {
  const audit = await harness
    .database()
    .select()
    .from(hostelAuditLog)
    .where(
      and(
        eq(hostelAuditLog.branchId, f.branchId),
        eq(hostelAuditLog.action, 'resident.payment.reversed'),
      ),
    );
  expect(audit).toHaveLength(1);
  expect(audit[0]).toMatchObject({
    actorUserId: f.ownerId,
    actorRole: 'owner',
    targetId: reversalId,
  });
}
