import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { residentFundMovements, residentLedger, hostelAuditLog } from '../src/index.js';
import { inventoryHarness } from './inventory.fixture.js';
import {
  financeScope,
  financeTime,
  postRent,
  issueInvoice,
  receivePayment,
} from './resident-finance.fixture.js';
import { reverseRecordedPayment } from './resident-finance-reversal.fixture.js';
import { recordResidentFundMovement } from '../src/resident-fund-movement.js';
import { readResidentFundBalance } from '../src/resident-fund-balance.js';
import { readResidentFundBalances } from '../src/resident-fund-balances.js';
const harness = inventoryHarness();
beforeAll(() => harness.start());
afterAll(() => harness.close());
async function prepare() {
  const f = await financeScope(harness);
  const data = await harness.database().transaction(async (tx) => {
    const chargeId = await postRent(tx, f),
      invoiceId = await issueInvoice(tx, f, chargeId),
      paymentId = await receivePayment(tx, f, {
        amount: 1501n,
        allocations: [],
        deposit: 1001n,
        advance: 500n,
      });
    return { invoiceId, paymentId };
  });
  return { ...f, ...data };
}
function command(
  f: Awaited<ReturnType<typeof prepare>>,
  kind: 'deposit_apply' | 'advance_apply' | 'deposit_deduct' | 'deposit_refund' | 'advance_refund',
  amountPaisa = 100,
) {
  const movement =
    kind === 'deposit_apply' || kind === 'advance_apply'
      ? { kind, amountPaisa, reason: 'Explicit invoice application', invoiceId: f.invoiceId }
      : { kind, amountPaisa, reason: 'External hostel settlement', externalReference: 'HOSTEL-1' };
  return {
    scope: { branchId: f.branchId, stayId: f.stayId, actorUserId: f.ownerId, actorRole: 'owner' },
    paymentId: f.paymentId,
    commandId: randomUUID(),
    movement,
  };
}
function run(input: unknown) {
  return harness.database().transaction((tx) => recordResidentFundMovement(tx, input, financeTime));
}
async function movementRows(stayId: string) {
  return harness
    .database()
    .select()
    .from(residentFundMovements)
    .where(eq(residentFundMovements.stayId, stayId));
}
it.each([
  'deposit_apply',
  'advance_apply',
  'deposit_deduct',
  'deposit_refund',
  'advance_refund',
] as const)(
  'RENT-005 / AUD-004: actual %s preserves original funding and commits complete source/ledger/audit',
  async (kind) => {
    const f = await prepare(),
      input = command(f, kind),
      result = await run(input);
    expect(await movementRows(f.stayId)).toHaveLength(1);
    const entries = await harness
      .database()
      .select()
      .from(residentLedger)
      .where(eq(residentLedger.fundMovementId, result.movementId));
    expect(entries).toHaveLength(kind.endsWith('_apply') ? 2 : 1);
    expect(
      entries.every((row) => row.fundingPaymentId === f.paymentId && row.amountPaisa === 100n),
    ).toBe(true);
    const audits = await harness
      .database()
      .select()
      .from(hostelAuditLog)
      .where(
        and(
          eq(hostelAuditLog.branchId, f.branchId),
          eq(hostelAuditLog.action, 'resident.fund.recorded'),
        ),
      );
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorUserId: f.ownerId,
      actorRole: 'owner',
      targetId: result.movementId,
    });
    const balance = await harness.database().transaction((tx) =>
      readResidentFundBalance(tx, {
        branchId: f.branchId,
        stayId: f.stayId,
        paymentId: f.paymentId,
      }),
    );
    expect(balance).toMatchObject(
      kind.startsWith('advance_')
        ? { deposit: { heldPaisa: 1001 }, advance: { availablePaisa: 400 } }
        : { deposit: { heldPaisa: 901 }, advance: { availablePaisa: 500 } },
    );
    const batch = await harness.database().transaction((tx) =>
      readResidentFundBalances(tx, {
        branchId: f.branchId,
        stayIds: [f.stayId],
      }),
    );
    expect(batch).toEqual([{ stayId: f.stayId, ...balance }]);
  },
);
it('ACC-001 / RENT-005: competing actual deposit refunds cannot overspend original receipt funds', async () => {
  const f = await prepare(),
    outcomes = await Promise.allSettled([
      run(command(f, 'deposit_refund', 1001)),
      run(command(f, 'deposit_refund', 1001)),
    ]);
  expect(outcomes.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
  expect(outcomes).toContainEqual(
    expect.objectContaining({
      status: 'rejected',
      reason: expect.objectContaining({
        code: 'CONFLICT',
        message: 'Movement exceeds available funds from this payment',
      }),
    }),
  );
  expect(await movementRows(f.stayId)).toHaveLength(1);
});
it('ACC-004: actual duplicate fund command cannot append a second source or ledger movement', async () => {
  const f = await prepare(),
    input = command(f, 'advance_refund'),
    outcomes = await Promise.allSettled([run(input), run(input)]);
  expect(outcomes.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
  expect(outcomes).toContainEqual(
    expect.objectContaining({
      status: 'rejected',
      reason: expect.objectContaining({
        code: 'CONFLICT',
        message: 'Fund command already recorded',
      }),
    }),
  );
  expect(await movementRows(f.stayId)).toHaveLength(1);
});
it('SEC-003: actual foreign funding payment cannot debit another Stay receipt', async () => {
  const f = await prepare(),
    foreign = await prepare();
  await expect(
    run({ ...command(f, 'deposit_refund'), paymentId: foreign.paymentId }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  expect(await movementRows(f.stayId)).toEqual([]);
});
it('PAY-008: actual reversed receipt cannot fund a new movement', async () => {
  const f = await prepare();
  await harness.database().transaction((tx) => reverseRecordedPayment(tx, f, f.paymentId));
  await expect(run(command(f, 'deposit_refund'))).rejects.toMatchObject({
    code: 'CONFLICT',
    message: 'Reversed payment cannot fund a new movement',
  });
  expect(await movementRows(f.stayId)).toEqual([]);
});
it('AUD-004 / ACC-004: actual mandatory movement audit failure rolls back source/ledger and allows clean retry', async () => {
  const f = await prepare(),
    input = command(f, 'deposit_refund');
  await harness
    .database()
    .execute(
      sql`create function hsm_test_fund_audit_failure() returns trigger language plpgsql as $$ begin if NEW.action = 'resident.fund.recorded' then raise exception 'Fixture fund audit failure' using errcode='P0001'; end if; return NEW; end; $$`,
    );
  await harness
    .database()
    .execute(
      sql`create trigger hsm_test_fund_audit_failure before insert on hostel_audit_log for each row execute function hsm_test_fund_audit_failure()`,
    );
  try {
    await expect(run(input)).rejects.toThrow();
    expect(await movementRows(f.stayId)).toEqual([]);
    const balance = await harness.database().transaction((tx) =>
      readResidentFundBalance(tx, {
        branchId: f.branchId,
        stayId: f.stayId,
        paymentId: f.paymentId,
      }),
    );
    expect(balance.deposit.heldPaisa).toBe(1001);
  } finally {
    await harness
      .database()
      .execute(sql`drop trigger if exists hsm_test_fund_audit_failure on hostel_audit_log`);
    await harness.database().execute(sql`drop function if exists hsm_test_fund_audit_failure()`);
  }
  expect(await run(input)).toMatchObject({ amountPaisa: 100, kind: 'deposit_refund' });
});
