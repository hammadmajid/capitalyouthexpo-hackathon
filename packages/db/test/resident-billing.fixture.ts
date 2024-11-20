import { eq } from 'drizzle-orm';
import { v7 } from 'uuid';
import {
  hostelAuditLog,
  notificationOutbox,
  residentBillingSchedules,
  residentBillingExecutions,
  residentBillingJobKey,
  RESIDENT_BILLING_EVENT,
  type Database,
} from '../src/index.js';
import type { FinanceScope } from './resident-finance.fixture.js';
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export async function billingScheduleFixture(
  transaction: Transaction,
  scope: FinanceScope,
  overrides: Partial<typeof residentBillingSchedules.$inferInsert> = {},
) {
  const id = v7(),
    jobId = v7(),
    now = new Date(),
    leaseToken = v7();
  const payload = { scheduleId: id, version: 1, periodIndex: 0 };
  const [audit] = await transaction
    .insert(hostelAuditLog)
    .values({
      organizationId: scope.organizationId,
      branchId: scope.branchId,
      actorUserId: scope.ownerId,
      actorRole: 'owner',
      action: 'billing.schedule.authorized',
      targetType: 'resident_billing_schedule',
      targetId: id,
      after: { agreementId: scope.agreementId, item: 'rent', cadence: 'periodic', periodIndex: 0 },
    })
    .returning({ id: hostelAuditLog.id });
  if (!audit) throw new Error('Schedule authorization audit fixture missing');
  await transaction.insert(notificationOutbox).values({
    id: jobId,
    eventType: RESIDENT_BILLING_EVENT,
    channel: 'internal',
    payload,
    dedupeKey: residentBillingJobKey(payload),
    nextAttemptAt: now,
    createdAt: now,
  });
  const value = {
    branchId: scope.branchId,
    stayId: scope.stayId,
    agreementId: scope.agreementId,
    item: 'rent',
    cadence: 'periodic',
    state: 'active',
    authorizedByUserId: scope.ownerId,
    authorizationAuditId: audit.id,
    version: 1,
    periodIndex: 0n,
    nextRunAt: now,
    currentJobId: jobId,
    createdAt: now,
    updatedAt: now,
    ...overrides,
    id: overrides.id ?? id,
  } satisfies typeof residentBillingSchedules.$inferInsert;
  return { value, jobId, now, leaseToken };
}
// Metadata-only obsolete work: never a successful admission, billing or worker claim.
export function obsoleteExecutionFixture(
  scope: FinanceScope,
  f: Awaited<ReturnType<typeof billingScheduleFixture>>,
) {
  return {
    id: v7(),
    branchId: scope.branchId,
    stayId: scope.stayId,
    agreementId: scope.agreementId,
    scheduleId: f.value.id,
    jobId: f.jobId,
    leaseToken: f.leaseToken,
    leaseExpiresAt: new Date(f.now.getTime() + 60000),
    scheduleVersion: 1,
    periodIndex: 0n,
    outcome: 'obsolete',
    executedAt: f.now,
  } satisfies typeof residentBillingExecutions.$inferInsert;
}

export async function completeObsoleteFixture(
  transaction: Transaction,
  scope: FinanceScope,
  omit?: 'audit' | 'ack',
) {
  const f = await billingScheduleFixture(transaction, scope, {
    state: 'stopped',
    currentJobId: null,
    nextRunAt: null,
  });
  await transaction.insert(residentBillingSchedules).values(f.value);
  const execution = obsoleteExecutionFixture(scope, f);
  await transaction
    .update(notificationOutbox)
    .set({ leaseToken: f.leaseToken, leaseExpiresAt: execution.leaseExpiresAt })
    .where(eq(notificationOutbox.id, f.jobId));
  await transaction.insert(residentBillingExecutions).values(execution);
  if (omit !== 'audit')
    await transaction.insert(hostelAuditLog).values({
      organizationId: scope.organizationId,
      branchId: scope.branchId,
      actorUserId: null,
      actorRole: 'system',
      action: 'billing.execution.completed',
      targetType: 'resident_billing_execution',
      targetId: execution.id,
      after: {
        scheduleId: f.value.id,
        agreementId: scope.agreementId,
        jobId: f.jobId,
        outcome: 'obsolete',
      },
    });
  if (omit !== 'ack')
    await transaction
      .update(notificationOutbox)
      .set({ status: 'sent', leaseToken: null, leaseExpiresAt: null, sentAt: new Date() })
      .where(eq(notificationOutbox.id, f.jobId));
  return { schedule: f.value, execution };
}

export async function stopBillingScheduleFixture(
  transaction: Transaction,
  scope: FinanceScope,
  mode?: 'missing' | 'wrong_actor' | 'wrong_before' | 'advance',
) {
  const f = await billingScheduleFixture(transaction, scope);
  await transaction.insert(residentBillingSchedules).values(f.value);
  const after = {
    ...f.value,
    version: 2,
    state: 'stopped' as const,
    periodIndex: mode === 'advance' ? 1n : 0n,
    currentJobId: null,
    nextRunAt: null,
    updatedAt: new Date(),
  };
  if (mode !== 'missing')
    await transaction.insert(hostelAuditLog).values({
      organizationId: scope.organizationId,
      branchId: scope.branchId,
      actorUserId: scope.ownerId,
      actorRole: mode === 'wrong_actor' ? 'customer' : 'owner',
      action: 'billing.schedule.changed',
      targetType: 'resident_billing_schedule',
      targetId: f.value.id,
      before: {
        version: mode === 'wrong_before' ? 2 : 1,
        state: 'active',
        periodIndex: 0,
        currentJobId: f.jobId,
      },
      after: {
        version: 2,
        state: 'stopped',
        periodIndex: Number(after.periodIndex),
        currentJobId: null,
      },
    });
  await transaction
    .update(residentBillingSchedules)
    .set(after)
    .where(eq(residentBillingSchedules.id, f.value.id));
  return after;
}
