import {
  financialRows,
  readSchedule,
  expectSourceProof,
  expectNoPayment,
} from './resident-billing-delivery-assertions.fixture.js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { v7 } from 'uuid';
import {
  deliverResidentBilling,
  postAgreedRentPeriod,
  residentBillingJobKey,
  residentCharges,
  residentInvoices,
  residentBillingExecutions,
  notificationOutbox,
  hostelAuditLog,
  stays,
} from '../src/index.js';
import { inventoryHarness } from './inventory.fixture.js';
import { billingRuntimeFixture } from './resident-billing-delivery.fixture.js';
import { expectBillingGuard } from './resident-billing-assertions.fixture.js';
const harness = inventoryHarness();
beforeAll(() => harness.start());
afterAll(() => harness.close());
const prepare = (mode?: Parameters<typeof billingRuntimeFixture>[1]) =>
  billingRuntimeFixture(harness, mode);
it('RENT-004 / ACC-004: real concurrent duplicate delivery commits one exact source, execution and next job', async () => {
  const f = await prepare();
  await Promise.all(
    Array.from({ length: 6 }, () => deliverResidentBilling(harness.database(), f.message)),
  );
  const rows = await financialRows(harness.database(), f.stayId);
  expect(rows.map((value) => value.length)).toEqual([1, 1, 1, 1, 1]);
  await expectSourceProof(harness.database(), f);
  const schedule = await readSchedule(harness.database(), f.scheduleId);
  expect(schedule).toMatchObject({
    state: 'active',
    version: 2,
    periodIndex: 1n,
    authorizedByUserId: f.ownerId,
  });
  const jobs = await harness
    .database()
    .select()
    .from(notificationOutbox)
    .where(sql`${notificationOutbox.payload}->>'scheduleId'=${f.scheduleId}`)
    .limit(3);
  expect(jobs).toHaveLength(2);
  expect(jobs.find((row) => row.id === f.message.id)).toMatchObject({
    status: 'sent',
    leaseToken: null,
    leaseExpiresAt: null,
  });
  expect(jobs.find((row) => row.id === schedule.currentJobId)).toMatchObject({
    status: 'pending',
    payload: { scheduleId: f.scheduleId, version: 2, periodIndex: 1 },
  });
  const audits = await harness
    .database()
    .select()
    .from(hostelAuditLog)
    .where(
      and(
        eq(hostelAuditLog.branchId, f.branchId),
        eq(hostelAuditLog.action, 'billing.execution.completed'),
      ),
    )
    .limit(2);
  expect(audits).toHaveLength(1);
  expect(audits[0]).toMatchObject({ actorUserId: null, actorRole: 'system' });
  await expectNoPayment(harness.database(), f.stayId);
});
it.each(['replaced', 'expired'] as const)(
  'SEC-003: a real %s lease neither writes finance nor acknowledges',
  async (mode) => {
    const f = await prepare();
    const leaseExpiresAt =
      mode === 'expired' ? new Date(Date.now() - 1000) : f.message.leaseExpiresAt;
    await harness
      .database()
      .update(notificationOutbox)
      .set({ leaseToken: mode === 'replaced' ? v7() : f.message.leaseToken, leaseExpiresAt })
      .where(eq(notificationOutbox.id, f.message.id));
    await deliverResidentBilling(
      harness.database(),
      mode === 'expired' ? { ...f.message, leaseExpiresAt } : f.message,
    );
    expect((await financialRows(harness.database(), f.stayId)).map((rows) => rows.length)).toEqual([
      0, 0, 0, 0, 0,
    ]);
    expect(await readSchedule(harness.database(), f.scheduleId)).toMatchObject({
      version: 1,
      periodIndex: 0n,
    });
  },
);
it.each([
  { mode: 'zero' as const, outcome: 'no_charge', state: 'active', cursor: 1n },
  { mode: 'manual' as const, outcome: 'manual_required', state: 'manual_required', cursor: 0n },
  { mode: 'stopped' as const, outcome: 'obsolete', state: 'stopped', cursor: 0n },
])(
  'RENT-004 / PAY-008: real neutral outcome %# does not invent a payment or release occupancy',
  async (value) => {
    const f = await prepare(value.mode);
    await deliverResidentBilling(harness.database(), f.message);
    const rows = await financialRows(harness.database(), f.stayId);
    expect(rows.map((row) => row.length)).toEqual([0, 0, 0, 1, 0]);
    expect(rows[3]?.[0]).toMatchObject({ outcome: value.outcome, chargeId: null, invoiceId: null });
    expect(await readSchedule(harness.database(), f.scheduleId)).toMatchObject({
      state: value.state,
      periodIndex: value.cursor,
      version: value.mode === 'stopped' ? 1 : 2,
    });
    const [stay] = await harness.database().select().from(stays).where(eq(stays.id, f.stayId));
    expect(stay?.state).toBe(value.mode === 'stopped' ? 'check_in_ready' : 'active');
    await expectNoPayment(harness.database(), f.stayId);
  },
);
it('AUD-004 / ACC-004: actual mandatory audit failure rolls back all financial sources and permits the same owned-lease retry', async () => {
  const f = await prepare();
  await harness
    .database()
    .execute(
      sql`create function hsm_test_billing_audit_failure() returns trigger language plpgsql as $$ begin if NEW.action='billing.execution.completed' then raise exception 'Fixture mandatory audit failure' using errcode='23514'; end if; return NEW; end; $$`,
    );
  try {
    await harness
      .database()
      .execute(
        sql`create trigger hsm_test_billing_audit_failure before insert on hostel_audit_log for each row execute function hsm_test_billing_audit_failure()`,
      );
    await expectBillingGuard(
      deliverResidentBilling(harness.database(), f.message),
      'Fixture mandatory audit failure',
    );
    expect((await financialRows(harness.database(), f.stayId)).map((rows) => rows.length)).toEqual([
      0, 0, 0, 0, 0,
    ]);
    expect(await readSchedule(harness.database(), f.scheduleId)).toMatchObject({
      version: 1,
      periodIndex: 0n,
      currentJobId: f.message.id,
    });
  } finally {
    await harness
      .database()
      .execute(sql`drop trigger if exists hsm_test_billing_audit_failure on hostel_audit_log`);
    await harness.database().execute(sql`drop function hsm_test_billing_audit_failure()`);
  }
  await deliverResidentBilling(harness.database(), f.message);
  expect((await financialRows(harness.database(), f.stayId)).map((rows) => rows.length)).toEqual([
    1, 1, 1, 1, 1,
  ]);
});
it('ACC-004: real next-job unique collision rolls back the entire current financial transaction', async () => {
  const f = await prepare();
  const payload = { scheduleId: f.scheduleId, version: 2, periodIndex: 1 };
  await harness
    .database()
    .insert(notificationOutbox)
    .values({
      eventType: 'resident.billing.period',
      channel: 'internal',
      payload,
      dedupeKey: residentBillingJobKey(payload),
    });
  const work = deliverResidentBilling(harness.database(), f.message).catch((error: unknown) => {
    throw error instanceof Error && error.cause instanceof Error ? error.cause : error;
  });
  await expect(work).rejects.toMatchObject({ code: '23505' });
  expect((await financialRows(harness.database(), f.stayId)).map((rows) => rows.length)).toEqual([
    0, 0, 0, 0, 0,
  ]);
  expect(await readSchedule(harness.database(), f.scheduleId)).toMatchObject({
    version: 1,
    periodIndex: 0n,
    currentJobId: f.message.id,
  });
});
it('RENT-003 / AUD-004: actual human source recovery retains its actor and never relabels it as system finance', async () => {
  const f = await prepare();
  const original = await harness.database().transaction(async (tx) => {
    const result = await postAgreedRentPeriod(
      tx,
      {
        branchId: f.branchId,
        stayId: f.stayId,
        agreementId: f.agreementId,
        actorUserId: f.ownerId,
        periodIndex: 0,
      },
      new Date(),
    );
    await tx.insert(hostelAuditLog).values({
      organizationId: f.organizationId,
      branchId: f.branchId,
      actorUserId: f.ownerId,
      actorRole: 'owner',
      action: 'rent.posted',
      targetType: 'stay',
      targetId: f.stayId,
      after: result,
    });
    return result;
  });
  await deliverResidentBilling(harness.database(), f.message);
  expect((await financialRows(harness.database(), f.stayId)).map((rows) => rows.length)).toEqual([
    1, 1, 1, 1, 0,
  ]);
  const [charge] = await harness
    .database()
    .select()
    .from(residentCharges)
    .where(eq(residentCharges.stayId, f.stayId));
  const [invoice] = await harness
    .database()
    .select()
    .from(residentInvoices)
    .where(eq(residentInvoices.stayId, f.stayId));
  const [execution] = await harness
    .database()
    .select()
    .from(residentBillingExecutions)
    .where(eq(residentBillingExecutions.stayId, f.stayId));
  expect(charge).toMatchObject({ id: original.chargeId, postedByUserId: f.ownerId });
  expect(invoice).toMatchObject({ id: original.invoiceId, issuedByUserId: f.ownerId });
  expect(execution).toMatchObject({
    outcome: 'existing',
    chargeId: original.chargeId,
    invoiceId: original.invoiceId,
  });
  await expectNoPayment(harness.database(), f.stayId);
});
it('RENT-004 / STAY-001: actual finite exhaustion stops recurrence without checking out or freeing a resident', async () => {
  const f = await prepare('finite');
  await deliverResidentBilling(harness.database(), f.message);
  expect(await readSchedule(harness.database(), f.scheduleId)).toMatchObject({
    state: 'exhausted',
    version: 2,
    periodIndex: 1n,
    currentJobId: null,
    nextRunAt: null,
  });
  const [stay] = await harness.database().select().from(stays).where(eq(stays.id, f.stayId));
  expect(stay).toMatchObject({ state: 'active', closedAt: null });
  expect((await financialRows(harness.database(), f.stayId)).map((rows) => rows.length)).toEqual([
    1, 1, 1, 1, 1,
  ]);
  const jobs = await harness
    .database()
    .select()
    .from(notificationOutbox)
    .where(sql`${notificationOutbox.payload}->>'scheduleId'=${f.scheduleId}`);
  expect(jobs).toHaveLength(1);
  expect(jobs[0]).toMatchObject({ id: f.message.id, status: 'sent' });
  await expectNoPayment(harness.database(), f.stayId);
});
