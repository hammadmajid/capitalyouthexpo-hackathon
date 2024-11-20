import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { v7 } from 'uuid';
import {
  residentBillingOrigins,
  residentCharges,
  residentInvoices,
  residentPayments,
  residentReceipts,
} from '../src/index.js';
import { inventoryHarness } from './inventory.fixture.js';
import { financeScope, postRent, issueInvoice } from './resident-finance.fixture.js';
import { expectBillingGuard } from './resident-billing-assertions.fixture.js';
const harness = inventoryHarness();
beforeAll(() => harness.start());
afterAll(() => harness.close());
async function humanPosting() {
  const scope = await financeScope(harness);
  const ids = await harness.database().transaction(async (tx) => {
    const chargeId = await postRent(tx, scope);
    const invoiceId = await issueInvoice(tx, scope, chargeId);
    return { chargeId, invoiceId };
  });
  return { ...scope, ...ids };
}
it('AUD-004 / FIN-002 / PAY-008: human posting retains its actual actor with no synthetic execution, payment or receipt', async () => {
  const f = await humanPosting();
  const [charge] = await harness
    .database()
    .select()
    .from(residentCharges)
    .where(eq(residentCharges.id, f.chargeId));
  const [invoice] = await harness
    .database()
    .select()
    .from(residentInvoices)
    .where(eq(residentInvoices.id, f.invoiceId));
  expect(charge).toMatchObject({ postedByUserId: f.ownerId, amountPaisa: 1800001n });
  expect(invoice).toMatchObject({
    issuedByUserId: f.ownerId,
    totalPaisa: 1800001n,
    state: 'issued',
  });
  expect(
    await harness
      .database()
      .select()
      .from(residentBillingOrigins)
      .where(eq(residentBillingOrigins.chargeId, f.chargeId)),
  ).toEqual([]);
  expect(
    await harness
      .database()
      .select()
      .from(residentPayments)
      .where(eq(residentPayments.stayId, f.stayId)),
  ).toEqual([]);
  expect(
    await harness
      .database()
      .select()
      .from(residentReceipts)
      .where(eq(residentReceipts.stayId, f.stayId)),
  ).toEqual([]);
});
it('AUD-004 / SEC-003: a real human posting cannot be relabelled as a scheduled execution', async () => {
  const f = await humanPosting();
  await expectBillingGuard(
    harness.database().insert(residentBillingOrigins).values({
      executionId: v7(),
      branchId: f.branchId,
      stayId: f.stayId,
      agreementId: f.agreementId,
      chargeId: f.chargeId,
      invoiceId: f.invoiceId,
    }),
    'Scheduled origin requires exact system financial sources',
  );
  expect(
    await harness
      .database()
      .select()
      .from(residentBillingOrigins)
      .where(eq(residentBillingOrigins.chargeId, f.chargeId)),
  ).toEqual([]);
});
it.each(['charge', 'invoice'] as const)(
  'AUD-004 / SEC-003: actorless %s without immutable scheduled proof cannot commit',
  async (kind) => {
    const f = await humanPosting();
    if (kind === 'charge') {
      const [row] = await harness
        .database()
        .select()
        .from(residentCharges)
        .where(eq(residentCharges.id, f.chargeId));
      if (!row) throw new Error('Human charge fixture missing');
      await expectBillingGuard(
        harness
          .database()
          .insert(residentCharges)
          .values({ ...row, id: v7(), sourceKey: 'blocked:' + v7(), postedByUserId: null }),
        'Charge requires exactly one human or scheduled origin',
      );
    } else {
      const [row] = await harness
        .database()
        .select()
        .from(residentInvoices)
        .where(eq(residentInvoices.id, f.invoiceId));
      if (!row) throw new Error('Human invoice fixture missing');
      await expectBillingGuard(
        harness
          .database()
          .insert(residentInvoices)
          .values({ ...row, id: v7(), number: 'BLOCKED-' + v7(), issuedByUserId: null }),
        'Invoice requires exactly one human or scheduled origin',
      );
    }
  },
);
it('AUD-004 / ACC-004: exact execution scope foreign key supports deferred atomic origin completion', async () => {
  const rows = await harness
    .database()
    .execute<{ condeferrable: boolean; condeferred: boolean }>(
      sql`select condeferrable,condeferred from pg_constraint where conname=${'resident_billing_origins_execution_fk'} and conrelid=${'resident_billing_origins'}::regclass`,
    );
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ condeferrable: true, condeferred: true });
});
it.each(['update', 'delete', 'truncate'] as const)(
  'AUD-004: even empty origin history rejects %s without fabricated financial sources',
  async (action) => {
    const operation =
      action === 'update'
        ? harness
            .database()
            .update(residentBillingOrigins)
            .set({ invoiceId: v7() })
            .where(eq(residentBillingOrigins.executionId, v7()))
        : action === 'delete'
          ? harness
              .database()
              .delete(residentBillingOrigins)
              .where(eq(residentBillingOrigins.executionId, v7()))
          : harness.database().execute(sql`truncate resident_billing_origins`);
    await expectBillingGuard(operation, 'Audit records are append-only', '42501');
  },
);
