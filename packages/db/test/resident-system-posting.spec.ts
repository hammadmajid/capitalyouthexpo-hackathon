import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import {
  residentBillingOrigins,
  residentBillingExecutions,
  residentBillingSchedules,
  residentCharges,
  residentInvoices,
  residentLedger,
  residentPayments,
  residentReceipts,
} from '../src/index.js';
import { inventoryHarness } from './inventory.fixture.js';
import { financeScope } from './resident-finance.fixture.js';
import { systemPostingFixture } from './resident-system-posting.fixture.js';
import {
  expectBillingGuard,
  expectBillingForeignKey,
} from './resident-billing-assertions.fixture.js';
const harness = inventoryHarness();
beforeAll(() => harness.start());
afterAll(() => harness.close());
it('AUD-004 / FIN-002 / PAY-008: real transaction commits exact system origin, execution and receivable without human impersonation or a payment', async () => {
  const scope = await financeScope(harness);
  const result = await harness.database().transaction((tx) => systemPostingFixture(tx, scope));
  const [origin] = await harness
    .database()
    .select()
    .from(residentBillingOrigins)
    .where(eq(residentBillingOrigins.executionId, result.executionId));
  expect(origin).toMatchObject({
    executionId: result.executionId,
    branchId: scope.branchId,
    stayId: scope.stayId,
    agreementId: scope.agreementId,
    chargeId: result.chargeId,
    invoiceId: result.invoiceId,
  });
  const [charge] = await harness
    .database()
    .select()
    .from(residentCharges)
    .where(eq(residentCharges.id, result.chargeId));
  const [invoice] = await harness
    .database()
    .select()
    .from(residentInvoices)
    .where(eq(residentInvoices.id, result.invoiceId));
  expect(charge).toMatchObject({ postedByUserId: null, amountPaisa: 1800001n });
  expect(invoice).toMatchObject({ issuedByUserId: null, totalPaisa: 1800001n, state: 'issued' });
  const [schedule] = await harness
    .database()
    .select()
    .from(residentBillingSchedules)
    .where(eq(residentBillingSchedules.id, result.scheduleId));
  expect(schedule).toMatchObject({
    authorizedByUserId: scope.ownerId,
    version: 2,
    periodIndex: 1n,
    state: 'exhausted',
  });
  await expectReceivableOnly(scope.stayId, result.chargeId);
});
it.each(['audit', 'ack', 'advance'] as const)(
  'AUD-004 / ACC-004: missing %s rolls back all system financial sources and proof',
  async (omit) => {
    const scope = await financeScope(harness);
    await expectBillingGuard(
      harness.database().transaction((tx) => systemPostingFixture(tx, scope, omit)),
      omit === 'advance'
        ? 'Billing execution schedule advance missing'
        : 'Billing execution completion proof missing',
    );
    await expectRolledBack(scope.stayId);
  },
);
it('AUD-004 / ACC-004: missing execution cannot commit an actorless financial origin', async () => {
  const scope = await financeScope(harness);
  await expectBillingForeignKey(
    harness.database().transaction((tx) => systemPostingFixture(tx, scope, 'execution')),
    'resident_billing_origins_execution_fk',
  );
  await expectRolledBack(scope.stayId);
});
async function expectRolledBack(stayId: string) {
  for (const table of [
    residentCharges,
    residentInvoices,
    residentLedger,
    residentBillingSchedules,
    residentBillingExecutions,
    residentBillingOrigins,
  ])
    expect(await harness.database().select().from(table).where(eq(table.stayId, stayId))).toEqual(
      [],
    );
}

it.each(['update', 'delete', 'truncate'] as const)(
  'AUD-004: committed system origin cannot be changed through %s',
  async (action) => {
    const scope = await financeScope(harness);
    const result = await harness.database().transaction((tx) => systemPostingFixture(tx, scope));
    const operation =
      action === 'update'
        ? harness
            .database()
            .update(residentBillingOrigins)
            .set({ invoiceId: result.invoiceId })
            .where(eq(residentBillingOrigins.executionId, result.executionId))
        : action === 'delete'
          ? harness
              .database()
              .delete(residentBillingOrigins)
              .where(eq(residentBillingOrigins.executionId, result.executionId))
          : harness.database().execute(sql`truncate resident_billing_origins`);
    await expectBillingGuard(operation, 'Audit records are append-only', '42501');
    expect(
      await harness
        .database()
        .select()
        .from(residentBillingOrigins)
        .where(eq(residentBillingOrigins.executionId, result.executionId)),
    ).toHaveLength(1);
  },
);

async function expectReceivableOnly(stayId: string, chargeId: string) {
  expect(
    await harness.database().select().from(residentLedger).where(eq(residentLedger.stayId, stayId)),
  ).toMatchObject([
    { account: 'receivable', side: 'debit', amountPaisa: 1800001n, chargeId: chargeId },
  ]);
  expect(
    await harness
      .database()
      .select()
      .from(residentPayments)
      .where(eq(residentPayments.stayId, stayId)),
  ).toEqual([]);
  expect(
    await harness
      .database()
      .select()
      .from(residentReceipts)
      .where(eq(residentReceipts.stayId, stayId)),
  ).toEqual([]);
}

it('AUD-004 / FIN-002: an authorized rent schedule cannot prove a different charge kind', async () => {
  const scope = await financeScope(harness);
  await expectBillingGuard(
    harness.database().transaction((tx) => systemPostingFixture(tx, scope, 'wrong_item')),
    'Scheduled origin item mismatch',
  );
  await expectRolledBack(scope.stayId);
});
