import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { v7 } from 'uuid';
import {
  residentBillingSchedules,
  residentBillingExecutions,
  hostelAuditLog,
  notificationOutbox,
  residentCharges,
  residentInvoices,
} from '../src/index.js';
import { inventoryHarness } from './inventory.fixture.js';
import { financeScope } from './resident-finance.fixture.js';
import { billingScheduleFixture, obsoleteExecutionFixture } from './resident-billing.fixture.js';
const harness = inventoryHarness();
beforeAll(() => harness.start());
afterAll(() => harness.close());

it('RENT-004 / AUD-004: exact agreement and actual human authorization persist without any financial posting', async () => {
  const scope = await financeScope(harness);
  const id = await harness.database().transaction(async (tx) => {
    const f = await billingScheduleFixture(tx, scope);
    await tx.insert(residentBillingSchedules).values(f.value);
    return f.value.id;
  });
  const [row] = await harness
    .database()
    .select()
    .from(residentBillingSchedules)
    .where(eq(residentBillingSchedules.id, id));
  expect(row).toMatchObject({
    branchId: scope.branchId,
    stayId: scope.stayId,
    agreementId: scope.agreementId,
    authorizedByUserId: scope.ownerId,
    version: 1,
    periodIndex: 0n,
  });
  expect(
    await harness
      .database()
      .select()
      .from(residentCharges)
      .where(eq(residentCharges.stayId, scope.stayId)),
  ).toEqual([]);
  expect(
    await harness
      .database()
      .select()
      .from(residentInvoices)
      .where(eq(residentInvoices.stayId, scope.stayId)),
  ).toEqual([]);
});
it('SEC-003 / AUD-004: another real user cannot substitute for the schedule audit authorizer', async () => {
  const scope = await financeScope(harness);
  await expect(
    harness.database().transaction(async (tx) => {
      const f = await billingScheduleFixture(tx, scope, { authorizedByUserId: scope.customerA });
      await tx.insert(residentBillingSchedules).values(f.value);
    }),
  ).rejects.toThrow();
  expect(
    await harness
      .database()
      .select()
      .from(residentBillingSchedules)
      .where(eq(residentBillingSchedules.stayId, scope.stayId)),
  ).toEqual([]);
  expect(
    await harness
      .database()
      .select()
      .from(hostelAuditLog)
      .where(eq(hostelAuditLog.branchId, scope.branchId)),
  ).toEqual([]);
});
it('SEC-003 / ACC-004: an exact foreign agreement cannot cross branch or Stay scope', async () => {
  const scope = await financeScope(harness),
    foreign = await financeScope(harness);
  await expect(
    harness.database().transaction(async (tx) => {
      const f = await billingScheduleFixture(tx, scope, { agreementId: foreign.agreementId });
      await tx.insert(residentBillingSchedules).values(f.value);
    }),
  ).rejects.toThrow();
});
it.each([
  { version: 0 },
  { periodIndex: -1n },
  { periodIndex: 9007199254740992n },
  { cadence: 'one_time' as const },
  { nextRunAt: null },
  { currentJobId: null },
  { state: 'stopped' as const },
  { state: 'manual_required' as const },
])('RENT-004: invalid schedule boundary %# rolls audit and outbox back', async (overrides) => {
  const scope = await financeScope(harness);
  await expect(
    harness.database().transaction(async (tx) => {
      const f = await billingScheduleFixture(tx, scope, overrides);
      await tx.insert(residentBillingSchedules).values(f.value);
    }),
  ).rejects.toThrow();
  expect(
    await harness
      .database()
      .select()
      .from(hostelAuditLog)
      .where(eq(hostelAuditLog.branchId, scope.branchId)),
  ).toEqual([]);
});
it('RENT-004 / ACC-001: concurrent same-agreement schedules admit exactly one immutable item identity', async () => {
  const scope = await financeScope(harness);
  const insert = () =>
    harness.database().transaction(async (tx) => {
      const f = await billingScheduleFixture(tx, scope);
      await tx.insert(residentBillingSchedules).values(f.value);
    });
  const outcomes = await Promise.allSettled([insert(), insert()]);
  expect(outcomes.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  expect(outcomes.filter((x) => x.status === 'rejected')).toHaveLength(1);
  expect(
    await harness
      .database()
      .select()
      .from(residentBillingSchedules)
      .where(eq(residentBillingSchedules.stayId, scope.stayId)),
  ).toHaveLength(1);
});
it.each([
  { scheduleVersion: 0 },
  { periodIndex: -1n },
  { periodIndex: 9007199254740992n },
  { sourceKey: 'invented' },
  { amountPaisa: 0n },
  { chargeId: v7() },
  { invoiceId: v7() },
  { periodStart: '2028-02-01' },
  { dueDate: '2028-02-05' },
  { outcome: 'posted' as const },
  { outcome: 'existing' as const },
  { outcome: 'no_charge' as const },
  { outcome: 'manual_required' as const },
])(
  'FIN-002 / PAY-008: inconsistent execution shape %# cannot become a financial result',
  async (overrides) => {
    const scope = await financeScope(harness);
    let inserted = false;
    await expect(
      harness.database().transaction(async (tx) => {
        const f = await billingScheduleFixture(tx, scope, {
          state: 'stopped',
          currentJobId: null,
          nextRunAt: null,
        });
        await tx.insert(residentBillingSchedules).values(f.value);
        const execution = obsoleteExecutionFixture(scope, f);
        await tx
          .update(notificationOutbox)
          .set({ leaseToken: f.leaseToken, leaseExpiresAt: execution.leaseExpiresAt })
          .where(eq(notificationOutbox.id, f.jobId));
        await tx.insert(residentBillingExecutions).values({ ...execution, ...overrides });
        inserted = true;
      }),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
    expect(inserted).toBe(false);
    expect(
      await harness
        .database()
        .select()
        .from(residentBillingExecutions)
        .where(eq(residentBillingExecutions.stayId, scope.stayId)),
    ).toEqual([]);
  },
);
it('AUD-004: authorization audit target cannot be replaced by another schedule identifier', async () => {
  const scope = await financeScope(harness);
  await expect(
    harness.database().transaction(async (tx) => {
      const f = await billingScheduleFixture(tx, scope, { id: v7() });
      await tx.insert(residentBillingSchedules).values(f.value);
    }),
  ).rejects.toThrow();
});
it('RENT-004: missing outbox work cannot leave an active schedule behind', async () => {
  const scope = await financeScope(harness);
  await expect(
    harness.database().transaction(async (tx) => {
      const f = await billingScheduleFixture(tx, scope);
      await tx.delete(notificationOutbox).where(eq(notificationOutbox.id, f.jobId));
      await tx.insert(residentBillingSchedules).values(f.value);
    }),
  ).rejects.toThrow();
});
