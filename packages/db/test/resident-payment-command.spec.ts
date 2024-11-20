import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import {
  residentPayments,
  residentReceipts,
  residentLedger,
  hostelAuditLog,
  readResidentInvoiceBalance,
} from '../src/index.js';
import { recordExternalResidentPayment } from '../src/resident-payment.js';
import { inventoryHarness } from './inventory.fixture.js';
import { financeScope, postRent, issueInvoice, financeTime } from './resident-finance.fixture.js';
import { expectBillingGuard as expectPaymentGuard } from './resident-billing-assertions.fixture.js';
const harness = inventoryHarness();
beforeAll(() => harness.start());
afterAll(() => harness.close());
async function prepare() {
  const f = await financeScope(harness);
  const invoiceId = await harness.database().transaction(async (tx) => {
    const chargeId = await postRent(tx, f);
    return issueInvoice(tx, f, chargeId);
  });
  return { ...f, invoiceId };
}
function command(f: Awaited<ReturnType<typeof prepare>>, mixed = false) {
  return {
    scope: { branchId: f.branchId, stayId: f.stayId, actorUserId: f.ownerId, actorRole: 'owner' },
    commandId: randomUUID(),
    payment: {
      amountPaisa: mixed ? 3000001 : 1800001,
      method: 'cash',
      paidOn: '2028-02-01',
      note: 'Received directly by hostel',
      allocations: [{ invoiceId: f.invoiceId, amountPaisa: 1800001 }],
      depositPaisa: mixed ? 1000000 : 0,
      advanceCreditPaisa: mixed ? 200000 : 0,
    },
  };
}
async function counts(stayId: string) {
  const db = harness.database();
  const values = [];
  for (const table of [residentPayments, residentReceipts])
    values.push((await db.select().from(table).where(eq(table.stayId, stayId))).length);
  return values;
}
it('PAY-008/009 / RENT-005: actual approved payment, exact receipt and rent/deposit/advance credits commit together', async () => {
  const f = await prepare(),
    input = command(f, true);
  const result = await harness
    .database()
    .transaction((tx) => recordExternalResidentPayment(tx, input, financeTime));
  expect(await counts(f.stayId)).toEqual([1, 1]);
  const [receipt] = await harness
    .database()
    .select()
    .from(residentReceipts)
    .where(eq(residentReceipts.paymentId, result.paymentId));
  expect(receipt).toMatchObject({
    number: result.receiptNumber,
    snapshot: {
      amountPaisa: 3000001,
      distribution: { allocatedPaisa: 1800001, depositPaisa: 1000000, advanceCreditPaisa: 200000 },
    },
  });
  const entries = await harness
    .database()
    .select()
    .from(residentLedger)
    .where(eq(residentLedger.paymentId, result.paymentId));
  expect(entries).toHaveLength(3);
  expect(
    entries.every((row) => row.fundingPaymentId === result.paymentId && row.side === 'credit'),
  ).toBe(true);
  const audit = await harness
    .database()
    .select()
    .from(hostelAuditLog)
    .where(
      and(
        eq(hostelAuditLog.branchId, f.branchId),
        eq(hostelAuditLog.action, 'resident.payment.recorded'),
      ),
    );
  expect(audit).toHaveLength(1);
  expect(audit[0]).toMatchObject({
    actorUserId: f.ownerId,
    actorRole: 'owner',
    targetId: result.paymentId,
  });
  const balance = await harness.database().transaction((tx) =>
    readResidentInvoiceBalance(tx, {
      branchId: f.branchId,
      stayId: f.stayId,
      invoiceId: f.invoiceId,
      today: '2028-02-01',
    }),
  );
  expect(balance).toMatchObject({ state: 'paid', allocatedPaisa: 1800001, outstandingPaisa: 0 });
});
it('ACC-004 / PAY-008: concurrent actual full-invoice payments cannot overallocate a receivable', async () => {
  const f = await prepare();
  const outcomes = await Promise.allSettled(
    Array.from({ length: 2 }, () =>
      harness
        .database()
        .transaction((tx) => recordExternalResidentPayment(tx, command(f), financeTime)),
    ),
  );
  expect(outcomes.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
  expect(outcomes.filter((row) => row.status === 'rejected')).toHaveLength(1);
  expect(outcomes).toContainEqual(
    expect.objectContaining({
      status: 'rejected',
      reason: expect.objectContaining({
        code: 'CONFLICT',
        message: 'Allocation exceeds invoice outstanding',
      }),
    }),
  );
  expect(await counts(f.stayId)).toEqual([1, 1]);
});
it('ACC-004: concurrent actual duplicate payment command commits one approval, receipt and audit', async () => {
  const f = await prepare(),
    input = command(f);
  const outcomes = await Promise.allSettled(
    Array.from({ length: 2 }, () =>
      harness.database().transaction((tx) => recordExternalResidentPayment(tx, input, financeTime)),
    ),
  );
  expect(outcomes.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
  expect(outcomes.filter((row) => row.status === 'rejected')).toHaveLength(1);
  expect(outcomes).toContainEqual(
    expect.objectContaining({
      status: 'rejected',
      reason: expect.objectContaining({
        code: 'CONFLICT',
        message: 'Payment command already recorded',
      }),
    }),
  );
  expect(await counts(f.stayId)).toEqual([1, 1]);
});
it.each(['audit', 'ledger'] as const)(
  'AUD-004 / ACC-004: actual mandatory %s failure rolls back approval and receipt',
  async (mode) => {
    const f = await prepare();
    await installFailure(mode);
    try {
      await expectPaymentGuard(
        harness
          .database()
          .transaction((tx) => recordExternalResidentPayment(tx, command(f), financeTime)),
        'Fixture mandatory payment failure',
      );
      expect(await counts(f.stayId)).toEqual([0, 0]);
      const credits = await harness
        .database()
        .select()
        .from(residentLedger)
        .where(and(eq(residentLedger.stayId, f.stayId), eq(residentLedger.side, 'credit')));
      expect(credits).toEqual([]);
    } finally {
      await removeFailure(mode);
    }
  },
);
it.each(['missing', 'rejected'] as const)(
  'SEC-003: actual proof %s validator cannot approve a payment or receipt',
  async (mode) => {
    const f = await prepare(),
      input = command(f);
    const validate =
      mode === 'missing'
        ? undefined
        : async () => {
            throw new Error('Proof access denied');
          };
    await expect(
      harness
        .database()
        .transaction((tx) =>
          recordExternalResidentPayment(
            tx,
            { ...input, payment: { ...input.payment, proofFileId: randomUUID() } },
            financeTime,
            validate,
          ),
        ),
    ).rejects.toThrow(
      mode === 'missing' ? 'Payment proof validation unavailable' : 'Proof access denied',
    );
    expect(await counts(f.stayId)).toEqual([0, 0]);
  },
);
it('SEC-003: actual foreign Stay invoice is never credited by another scoped payment', async () => {
  const f = await prepare(),
    foreign = await prepare(),
    input = command(f);
  await expect(
    harness.database().transaction((tx) =>
      recordExternalResidentPayment(
        tx,
        {
          ...input,
          payment: {
            ...input.payment,
            allocations: [{ invoiceId: foreign.invoiceId, amountPaisa: 1800001 }],
          },
        },
        financeTime,
      ),
    ),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(await counts(f.stayId)).toEqual([0, 0]);
});
it.each([
  { account: 'deposit', depositPaisa: 1000, advanceCreditPaisa: 0 },
  { account: 'advance', depositPaisa: 0, advanceCreditPaisa: 1000 },
])(
  'RENT-005: actual $account-only external receipt has no invented rent allocation',
  async (value) => {
    const f = await prepare(),
      input = command(f);
    const result = await harness.database().transaction((tx) =>
      recordExternalResidentPayment(
        tx,
        {
          ...input,
          payment: {
            ...input.payment,
            amountPaisa: 1000,
            allocations: [],
            depositPaisa: value.depositPaisa,
            advanceCreditPaisa: value.advanceCreditPaisa,
          },
        },
        financeTime,
      ),
    );
    const rows = await harness
      .database()
      .select()
      .from(residentLedger)
      .where(eq(residentLedger.paymentId, result.paymentId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ account: value.account, amountPaisa: 1000n, invoiceId: null });
  },
);
async function installFailure(mode: 'audit' | 'ledger') {
  if (mode === 'audit') {
    await harness
      .database()
      .execute(
        sql`create function hsm_test_payment_failure() returns trigger language plpgsql as $$ begin if NEW.action = 'resident.payment.recorded' then raise exception 'Fixture mandatory payment failure' using errcode='23514'; end if; return NEW; end; $$`,
      );
    await harness
      .database()
      .execute(
        sql`create trigger hsm_test_payment_failure before insert on hostel_audit_log for each row execute function hsm_test_payment_failure()`,
      );
  } else {
    await harness
      .database()
      .execute(
        sql`create function hsm_test_payment_failure() returns trigger language plpgsql as $$ begin if NEW.payment_id is not null then raise exception 'Fixture mandatory payment failure' using errcode='23514'; end if; return NEW; end; $$`,
      );
    await harness
      .database()
      .execute(
        sql`create trigger hsm_test_payment_failure before insert on resident_ledger for each row execute function hsm_test_payment_failure()`,
      );
  }
}
async function removeFailure(mode: 'audit' | 'ledger') {
  if (mode === 'audit')
    await harness
      .database()
      .execute(sql`drop trigger if exists hsm_test_payment_failure on hostel_audit_log`);
  else
    await harness
      .database()
      .execute(sql`drop trigger if exists hsm_test_payment_failure on resident_ledger`);
  await harness.database().execute(sql`drop function hsm_test_payment_failure()`);
}
