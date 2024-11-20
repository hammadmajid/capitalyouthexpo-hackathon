import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import {
  residentBillingSchedules,
  notificationOutbox,
  residentCharges,
  residentInvoices,
  residentLedger,
  hostelAuditLog,
} from '../src/index.js';
import { initializeAdmissionBilling } from '../src/resident-admission-billing.js';
import { financeScope } from './resident-finance.fixture.js';
import { inventoryHarness } from './inventory.fixture.js';
import { expectBillingGuard } from './resident-billing-assertions.fixture.js';
const harness = inventoryHarness();
beforeAll(() => harness.start());
afterAll(() => harness.close());
function scope(f: Awaited<ReturnType<typeof financeScope>>) {
  return {
    organizationId: f.organizationId,
    branchId: f.branchId,
    stayId: f.stayId,
    agreementId: f.agreementId,
    actorUserId: f.ownerId,
    actorRole: 'owner',
  };
}
const rent = { item: 'rent', cadence: 'periodic', periodIndex: 0 };
it('STAY-001 / RENT-003 / FIN-004: real initial rent and disclosed fee commit as human sources with exhausted future schedules', async () => {
  const f = await financeScope(harness, {
    fees: [{ code: 'admission', cadence: 'one_time', amountPaisa: 777 }],
    feeBilling: { oneTimeDueOffsetDays: 0 },
  });
  const result = await harness.database().transaction((tx) =>
    initializeAdmissionBilling(
      tx,
      {
        scope: scope(f),
        selections: [rent, { item: 'admission', cadence: 'one_time', periodIndex: 0 }],
      },
      new Date(),
    ),
  );
  expect(result).toHaveLength(2);
  expect(result.map((row) => row.schedule.state)).toEqual(['exhausted', 'exhausted']);
  const charges = await harness
    .database()
    .select()
    .from(residentCharges)
    .where(eq(residentCharges.stayId, f.stayId));
  expect(charges).toHaveLength(2);
  expect(charges.map((row) => row.amountPaisa).sort()).toEqual([1800001n, 777n]);
  expect(charges.every((row) => row.postedByUserId === f.ownerId)).toBe(true);
  const invoices = await harness
    .database()
    .select()
    .from(residentInvoices)
    .where(eq(residentInvoices.stayId, f.stayId));
  expect(invoices).toHaveLength(2);
  expect(invoices.every((row) => row.issuedByUserId === f.ownerId)).toBe(true);
  const ledger = await harness
    .database()
    .select()
    .from(residentLedger)
    .where(eq(residentLedger.stayId, f.stayId));
  expect(ledger).toHaveLength(2);
  expect(ledger.every((row) => row.side === 'debit' && row.account === 'receivable')).toBe(true);
  const schedules = await harness
    .database()
    .select()
    .from(residentBillingSchedules)
    .where(eq(residentBillingSchedules.stayId, f.stayId));
  expect(schedules).toHaveLength(2);
  expect(
    schedules.every(
      (row) => row.state === 'exhausted' && row.currentJobId === null && row.periodIndex === 1n,
    ),
  ).toBe(true);
});
it('ACC-004 / AUD-004: actual future-schedule audit failure rolls back initial charge, invoice and ledger', async () => {
  const f = await financeScope(harness);
  await harness
    .database()
    .execute(
      sql`create function hsm_test_initial_billing_failure() returns trigger language plpgsql as $$ begin if NEW.action = 'billing.schedule.authorized' then raise exception 'Fixture initial billing audit failure' using errcode='23514'; end if; return NEW; end; $$`,
    );
  try {
    await harness
      .database()
      .execute(
        sql`create trigger hsm_test_initial_billing_failure before insert on hostel_audit_log for each row execute function hsm_test_initial_billing_failure()`,
      );
    await expectBillingGuard(
      harness
        .database()
        .transaction((tx) =>
          initializeAdmissionBilling(tx, { scope: scope(f), selections: [rent] }, new Date()),
        ),
      'Fixture initial billing audit failure',
    );
    for (const table of [
      residentCharges,
      residentInvoices,
      residentLedger,
      residentBillingSchedules,
    ])
      expect(
        await harness.database().select().from(table).where(eq(table.stayId, f.stayId)),
      ).toEqual([]);
    const audits = await harness
      .database()
      .select()
      .from(hostelAuditLog)
      .where(
        and(
          eq(hostelAuditLog.branchId, f.branchId),
          eq(hostelAuditLog.action, 'billing.schedule.authorized'),
        ),
      );
    expect(audits).toEqual([]);
  } finally {
    await harness
      .database()
      .execute(sql`drop trigger if exists hsm_test_initial_billing_failure on hostel_audit_log`);
    await harness.database().execute(sql`drop function hsm_test_initial_billing_failure()`);
  }
});
it('RENT-003: real explicit zero manual initial amount creates no fabricated financial source', async () => {
  const f = await financeScope(
    harness,
    { proration: { kind: 'manual' } },
    { moveInDate: '2028-02-10', expectedLeaveDate: '2028-03-01' },
  );
  const [result] = await harness
    .database()
    .transaction((tx) =>
      initializeAdmissionBilling(
        tx,
        { scope: scope(f), selections: [{ ...rent, manualAmountPaisa: 0 }] },
        new Date(),
      ),
    );
  expect(result).toMatchObject({
    posting: { status: 'no_charge', chargeId: null, invoiceId: null },
    schedule: { state: 'exhausted', periodIndex: 1 },
  });
  for (const table of [residentCharges, residentInvoices, residentLedger])
    expect(await harness.database().select().from(table).where(eq(table.stayId, f.stayId))).toEqual(
      [],
    );
});

it('RENT-004: real initial posting schedules the next period on its agreed due date rather than immediately', async () => {
  const f = await financeScope(harness, undefined, {
    moveInDate: '2028-02-01',
    expectedLeaveDate: '2028-04-01',
  });
  const [result] = await harness
    .database()
    .transaction((tx) =>
      initializeAdmissionBilling(tx, { scope: scope(f), selections: [rent] }, new Date()),
    );
  if (!result) throw new Error('Initial billing missing');
  const [schedule] = await harness
    .database()
    .select()
    .from(residentBillingSchedules)
    .where(eq(residentBillingSchedules.id, result.schedule.id));
  expect(schedule).toMatchObject({
    state: 'active',
    periodIndex: 1n,
    nextRunAt: new Date('2028-03-05T00:00:00Z'),
  });
  if (!result.schedule.currentJobId) throw new Error('Next job missing');
  const [job] = await harness
    .database()
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.id, result.schedule.currentJobId));
  expect(job).toMatchObject({
    status: 'pending',
    nextAttemptAt: new Date('2028-03-05T00:00:00Z'),
    payload: { scheduleId: result.schedule.id, version: 1, periodIndex: 1 },
  });
});
