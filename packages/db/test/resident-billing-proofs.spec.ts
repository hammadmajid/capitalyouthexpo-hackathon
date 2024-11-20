import { expectBillingGuard } from './resident-billing-assertions.fixture.js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { v7 } from 'uuid';
import {
  residentBillingSchedules,
  residentBillingExecutions,
  hostelAuditLog,
  notificationOutbox,
  residentCharges,
} from '../src/index.js';
import { inventoryHarness } from './inventory.fixture.js';
import { financeScope } from './resident-finance.fixture.js';
import {
  billingScheduleFixture,
  obsoleteExecutionFixture,
  completeObsoleteFixture,
} from './resident-billing.fixture.js';
const harness = inventoryHarness();
beforeAll(() => harness.start());
afterAll(() => harness.close());
it('AUD-004 / RENT-004: obsolete work records a system actor, actual live lease and atomic acknowledgement without monetary records', async () => {
  const scope = await financeScope(harness);
  const result = await harness.database().transaction((tx) => completeObsoleteFixture(tx, scope));
  const [execution] = await harness
    .database()
    .select()
    .from(residentBillingExecutions)
    .where(eq(residentBillingExecutions.id, result.execution.id));
  expect(execution).toMatchObject({
    outcome: 'obsolete',
    scheduleId: result.schedule.id,
    chargeId: null,
    invoiceId: null,
    amountPaisa: null,
  });
  const [work] = await harness
    .database()
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.id, result.execution.jobId));
  expect(work).toMatchObject({ status: 'sent', leaseToken: null, leaseExpiresAt: null });
  const audits = await harness
    .database()
    .select()
    .from(hostelAuditLog)
    .where(eq(hostelAuditLog.targetId, result.execution.id));
  expect(audits).toHaveLength(1);
  expect(audits[0]).toMatchObject({
    actorUserId: null,
    actorRole: 'system',
    action: 'billing.execution.completed',
  });
  expect(
    await harness
      .database()
      .select()
      .from(residentCharges)
      .where(eq(residentCharges.stayId, scope.stayId)),
  ).toEqual([]);
});
it.each(['audit', 'ack'] as const)(
  'AUD-004 / ACC-004: missing %s rolls execution, schedule and authorization back at commit',
  async (omit) => {
    const scope = await financeScope(harness);
    await expectBillingGuard(
      harness.database().transaction((tx) => completeObsoleteFixture(tx, scope, omit)),
      'Billing execution completion proof missing',
    );
    expect(
      await harness
        .database()
        .select()
        .from(residentBillingExecutions)
        .where(eq(residentBillingExecutions.stayId, scope.stayId)),
    ).toEqual([]);
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
  },
);
it('AUD-004: committed schedule and execution history cannot be rewritten or deleted', async () => {
  const scope = await financeScope(harness);
  const result = await harness.database().transaction((tx) => completeObsoleteFixture(tx, scope));
  await expectBillingGuard(
    harness
      .database()
      .update(residentBillingExecutions)
      .set({ outcome: 'no_period' })
      .where(eq(residentBillingExecutions.id, result.execution.id)),
    'Billing execution history is immutable',
  );
  await expectBillingGuard(
    harness
      .database()
      .delete(residentBillingExecutions)
      .where(eq(residentBillingExecutions.id, result.execution.id)),
    'Billing execution history is immutable',
  );
  await expectBillingGuard(
    harness
      .database()
      .update(residentBillingSchedules)
      .set({ version: 2, state: 'manual_required' })
      .where(eq(residentBillingSchedules.id, result.schedule.id)),
    'Billing schedule transition mismatch',
  );
  await expectBillingGuard(
    harness
      .database()
      .delete(residentBillingSchedules)
      .where(eq(residentBillingSchedules.id, result.schedule.id)),
    'Billing schedule history cannot be removed',
  );
  expect(
    await harness
      .database()
      .select()
      .from(residentBillingExecutions)
      .where(eq(residentBillingExecutions.id, result.execution.id)),
  ).toHaveLength(1);
});
it.each(['missing', 'expired', 'replaced'] as const)(
  'SEC-003 / RENT-004: %s worker lease cannot record execution',
  async (mode) => {
    const scope = await financeScope(harness);
    await expectBillingGuard(
      harness.database().transaction(async (tx) => {
        const f = await billingScheduleFixture(tx, scope, {
          state: 'stopped',
          currentJobId: null,
          nextRunAt: null,
        });
        await tx.insert(residentBillingSchedules).values(f.value);
        const execution = obsoleteExecutionFixture(scope, f);
        if (mode === 'expired') {
          execution.executedAt = new Date(f.now.getTime() - 90000);
          execution.leaseExpiresAt = new Date(f.now.getTime() - 60000);
          await tx
            .update(notificationOutbox)
            .set({ createdAt: new Date(f.now.getTime() - 120000) })
            .where(eq(notificationOutbox.id, f.jobId));
        }
        if (mode !== 'missing')
          await tx
            .update(notificationOutbox)
            .set({
              leaseToken: mode === 'replaced' ? v7() : f.leaseToken,
              leaseExpiresAt: execution.leaseExpiresAt,
            })
            .where(eq(notificationOutbox.id, f.jobId));
        await tx.insert(residentBillingExecutions).values(execution);
      }),
      'Billing execution work or lease mismatch',
    );
  },
);
it.each(['actor', 'action', 'target', 'facts'] as const)(
  'SEC-003 / AUD-004: unrelated authorization audit %s cannot activate a schedule',
  async (kind) => {
    const scope = await financeScope(harness);
    await expectBillingGuard(
      harness.database().transaction(async (tx) => {
        const f = await billingScheduleFixture(tx, scope);
        const change =
          kind === 'actor'
            ? { actorRole: 'system' }
            : kind === 'action'
              ? { action: 'booking.confirmed' }
              : kind === 'target'
                ? { targetType: 'booking' }
                : { after: { agreementId: scope.agreementId } };
        // Insert a separate unrelated audit; immutable original audit history is retained.
        const [audit] = await tx
          .insert(hostelAuditLog)
          .values({
            organizationId: scope.organizationId,
            branchId: scope.branchId,
            actorUserId: scope.ownerId,
            actorRole: 'owner',
            action: 'billing.schedule.authorized',
            targetType: 'resident_billing_schedule',
            targetId: f.value.id,
            after: {
              agreementId: scope.agreementId,
              item: 'rent',
              cadence: 'periodic',
              periodIndex: 0,
            },
            ...change,
          })
          .returning({ id: hostelAuditLog.id });
        if (!audit) throw new Error('Unrelated audit fixture missing');
        await tx
          .insert(residentBillingSchedules)
          .values({ ...f.value, authorizationAuditId: audit.id });
      }),
      'Billing schedule authorization mismatch',
    );
  },
);
it.each(['payload', 'event', 'recipient', 'dedupe'] as const)(
  'SEC-003 / RENT-004: mismatched %s in current outbox work cannot activate schedule',
  async (kind) => {
    const scope = await financeScope(harness);
    await expectBillingGuard(
      harness.database().transaction(async (tx) => {
        const f = await billingScheduleFixture(tx, scope);
        const change =
          kind === 'payload'
            ? { payload: { scheduleId: f.value.id, version: 1, periodIndex: 0, amountPaisa: 1 } }
            : kind === 'event'
              ? { eventType: 'files.scan' }
              : kind === 'recipient'
                ? { recipientUserId: scope.customerA }
                : { dedupeKey: v7() };
        await tx.update(notificationOutbox).set(change).where(eq(notificationOutbox.id, f.jobId));
        await tx.insert(residentBillingSchedules).values(f.value);
      }),
      'Billing schedule work mismatch',
    );
  },
);

it.each(['payload', 'event', 'dedupe', 'recipient'] as const)(
  'SEC-003 / AUD-004: changing acknowledged work %s before commit cannot detach execution provenance',
  async (kind) => {
    const scope = await financeScope(harness);
    await expectBillingGuard(
      harness.database().transaction(async (tx) => {
        const result = await completeObsoleteFixture(tx, scope);
        const change =
          kind === 'payload'
            ? {
                payload: {
                  scheduleId: result.schedule.id,
                  version: 1,
                  periodIndex: 0,
                  amountPaisa: 1,
                },
              }
            : kind === 'event'
              ? { eventType: 'files.scan' }
              : kind === 'dedupe'
                ? { dedupeKey: v7() }
                : { recipientUserId: scope.customerA };
        await tx
          .update(notificationOutbox)
          .set(change)
          .where(eq(notificationOutbox.id, result.execution.jobId));
      }),
      'Billing execution completion proof missing',
    );
  },
);
