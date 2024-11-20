import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  checkoutStay,
  inventoryClaims,
  organizations,
  readStaySettlement,
  recordResidentFundMovement,
  residentFundMovements,
  residentInvoices,
  stayFinalStatements,
  stays,
  type LifecycleAuthorizer,
} from '../src/index.js';
import { inventoryHarness } from './inventory.fixture.js';
import {
  manualAdmissionScope,
  manualCommand,
  runManualAdmission,
} from './manual-admission.fixture.js';
import { issueInvoice, postRent, receivePayment } from './resident-finance.fixture.js';
import { accountBalance } from './resident-finance-balances.fixture.js';

const harness = inventoryHarness();
beforeAll(() => harness.start());
afterAll(() => harness.close());
const now = new Date('2028-02-02T06:00:00Z');
const authorize: LifecycleAuthorizer = async (tx, scope) => {
  const [owner] = await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.id, scope.organizationId),
        eq(organizations.ownerUserId, scope.actorUserId),
      ),
    );
  if (!owner || scope.actorRole !== 'owner') throw new Error('Fixture owner unavailable');
};
async function admitted() {
  const f = await manualAdmissionScope(harness);
  const input = manualCommand(f);
  const result = await runManualAdmission(harness, {
    ...input,
    manual: {
      ...input.manual,
      resident: { kind: 'new', profile: { displayName: 'Finance fixture resident' } },
    },
  });
  return { ...f, ...result };
}
function command(f: Awaited<ReturnType<typeof admitted>>, applyAvailableDeposit = false) {
  return {
    scope: {
      organizationId: f.organizationId,
      branchId: f.branchId,
      stayId: f.stayId,
      actorUserId: f.ownerId,
      actorRole: 'owner' as const,
    },
    checkout: { expectedVersion: 1, reason: 'Verified checkout', applyAvailableDeposit },
  };
}
function checkout(f: Awaited<ReturnType<typeof admitted>>, apply = false) {
  return harness
    .database()
    .transaction((tx) => checkoutStay(tx, command(f, apply), now, authorize));
}
function fundScope(f: Awaited<ReturnType<typeof admitted>>) {
  return {
    branchId: f.branchId,
    stayId: f.stayId,
    actorUserId: f.ownerId,
    actorRole: 'owner' as const,
  };
}

it('OUT-003..006 / ACC-001/004 / AUD-001: complete deposit traversal and persisted checkout reconcile after 200 details and 100 newer payments', async () => {
  const f = await admitted();
  const deposit = 3800001n;
  const paymentId = await harness.database().transaction(async (tx) => {
    const source = await receivePayment(tx, f, {
      amount: deposit,
      allocations: [],
      deposit,
      advance: 0n,
    });
    for (let index = 0; index < 200; index += 1) {
      const charge = await postRent(tx, f, 10000n, 'checkout:' + index);
      await issueInvoice(tx, f, charge, 10000n);
    }
    for (let index = 0; index < 101; index += 1) {
      const charge = await postRent(tx, f, 100n, 'newer-paid:' + index);
      const invoiceId = await issueInvoice(tx, f, charge, 100n);
      await receivePayment(tx, f, {
        amount: 100n,
        allocations: [{ invoiceId, amount: 100n }],
        deposit: 0n,
        advance: 0n,
      });
    }
    return source;
  });
  const before = await harness
    .database()
    .select()
    .from(residentInvoices)
    .where(eq(residentInvoices.stayId, f.stayId));
  expect(await accountBalance(harness.database(), f, 'receivable')).toBe(deposit);
  const result = await checkout(f, true);
  expect(result.depositApplied).toHaveLength(201);
  expect(result.depositApplied.every((row) => row.paymentId === paymentId)).toBe(true);
  expect(result.depositApplied.reduce((sum, row) => sum + BigInt(row.amountPaisa), 0n)).toBe(
    deposit,
  );
  expect(result.statement).toMatchObject({
    outstandingPaisa: 0,
    netPayablePaisa: 0,
    netRefundablePaisa: 0,
    deposit: { heldPaisa: 0 },
  });
  expect(result.statement.invoices).toHaveLength(200);
  expect(result.statement.invoicesTruncated).toBe(true);
  const [frozen] = await harness
    .database()
    .select()
    .from(stayFinalStatements)
    .where(eq(stayFinalStatements.stayId, f.stayId));
  expect(frozen?.snapshot).toEqual(result.statement);
  expect(await accountBalance(harness.database(), f, 'receivable')).toBe(0n);
  expect(await accountBalance(harness.database(), f, 'deposit')).toBe(0n);
  expect(
    await harness
      .database()
      .select()
      .from(residentInvoices)
      .where(eq(residentInvoices.stayId, f.stayId)),
  ).toEqual(before);
  await expect(checkout(f, true)).rejects.toThrow();
  expect(
    await harness
      .database()
      .select()
      .from(stayFinalStatements)
      .where(eq(stayFinalStatements.stayId, f.stayId)),
  ).toHaveLength(1);
}, 60000);

it('OUT-005 / AUD-001: a failed checkout rolls back deposit applications, frozen statement and occupancy release', async () => {
  const f = await admitted();
  await harness
    .database()
    .transaction((tx) =>
      receivePayment(tx, f, { amount: 5000n, allocations: [], deposit: 5000n, advance: 0n }),
    );
  await expect(
    harness.database().transaction(async (tx) => {
      await checkoutStay(tx, command(f, true), now, authorize);
      throw new Error('Injected failure before commit');
    }),
  ).rejects.toThrow('Injected failure before commit');
  expect(
    await harness
      .database()
      .select()
      .from(residentFundMovements)
      .where(eq(residentFundMovements.stayId, f.stayId)),
  ).toHaveLength(0);
  expect(
    await harness
      .database()
      .select()
      .from(stayFinalStatements)
      .where(eq(stayFinalStatements.stayId, f.stayId)),
  ).toHaveLength(0);
  const [stay] = await harness.database().select().from(stays).where(eq(stays.id, f.stayId));
  expect(stay?.state).toBe('active');
  const [claim] = await harness
    .database()
    .select()
    .from(inventoryClaims)
    .where(eq(inventoryClaims.assignmentId, f.assignmentId));
  expect(claim?.releasedAt).toBeNull();
  const settlement = await harness
    .database()
    .transaction((tx) =>
      readStaySettlement(tx, { branchId: f.branchId, stayId: f.stayId, today: '2028-02-02' }),
    );
  expect(settlement.deposit.heldPaisa).toBe(5000);
});

it('OUT-003..006 / ACC-001 / AUD-001: racing checkouts commit one statement and release inventory once', async () => {
  const f = await admitted();
  const results = await Promise.allSettled([checkout(f), checkout(f)]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  expect(
    await harness
      .database()
      .select()
      .from(stayFinalStatements)
      .where(eq(stayFinalStatements.stayId, f.stayId)),
  ).toHaveLength(1);
});

it('OUT-003/004 / ACC-004 / AUD-001: refund racing deposit application cannot spend the same held funds twice', async () => {
  const f = await admitted();
  const paymentId = await harness
    .database()
    .transaction((tx) =>
      receivePayment(tx, f, { amount: 5000n, allocations: [], deposit: 5000n, advance: 0n }),
    );
  const refund = harness.database().transaction((tx) =>
    recordResidentFundMovement(
      tx,
      {
        scope: fundScope(f),
        paymentId,
        commandId: crypto.randomUUID(),
        movement: {
          kind: 'deposit_refund',
          amountPaisa: 3000,
          reason: 'External refund recorded',
          externalReference: 'AUD-001-RACE',
        },
      },
      now,
    ),
  );
  const results = await Promise.allSettled([checkout(f, true), refund]);
  expect(results[0]?.status).toBe('fulfilled');
  const moves = await harness
    .database()
    .select()
    .from(residentFundMovements)
    .where(eq(residentFundMovements.stayId, f.stayId));
  expect(moves.reduce((sum, row) => sum + row.amountPaisa, 0n)).toBe(5000n);
  const applied = moves
    .filter((row) => row.kind === 'deposit_apply')
    .reduce((sum, row) => sum + row.amountPaisa, 0n);
  const [statement] = await harness
    .database()
    .select()
    .from(stayFinalStatements)
    .where(eq(stayFinalStatements.stayId, f.stayId));
  expect(statement?.snapshot.outstandingPaisa).toBe(1800001 - Number(applied));
  expect(await accountBalance(harness.database(), f, 'deposit')).toBe(0n);
});

it('OUT-003..005 / RENT-005 / AUD-001: partially consumed deposit and advance remain distinct in the frozen statement', async () => {
  const f = await admitted();
  const paymentId = await harness.database().transaction((tx) =>
    receivePayment(tx, f, {
      amount: 9000n,
      allocations: [],
      deposit: 7000n,
      advance: 2000n,
    }),
  );
  await harness.database().transaction((tx) =>
    recordResidentFundMovement(
      tx,
      {
        scope: fundScope(f),
        paymentId,
        commandId: crypto.randomUUID(),
        movement: { kind: 'deposit_refund', amountPaisa: 1500, reason: 'Partial external refund' },
      },
      now,
    ),
  );
  const result = await checkout(f, true);
  expect(result.statement).toMatchObject({
    outstandingPaisa: 1794501,
    netPayablePaisa: 1792501,
    deposit: { refundedPaisa: 1500, appliedToRentPaisa: 5500, heldPaisa: 0 },
    advance: { heldPaisa: 2000 },
  });
});
