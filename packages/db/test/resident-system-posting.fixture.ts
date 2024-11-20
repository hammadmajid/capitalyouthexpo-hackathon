import { money } from '@hsm/contracts';
import { eq } from 'drizzle-orm';
import { v7 } from 'uuid';
import {
  hostelAuditLog,
  notificationOutbox,
  residentBillingSchedules,
  residentBillingExecutions,
} from '../src/index.js';
import {
  postPlannedResidentCharge,
  type PlannedResidentCharge,
} from '../src/resident-charge-posting.js';
import type { PostingTransaction } from '../src/resident-posting-context.js';
import type { FinanceScope } from './resident-finance.fixture.js';
import { billingScheduleFixture } from './resident-billing.fixture.js';
export const systemRentPlan: PlannedResidentCharge = {
  kind: 'rent',
  sourceKey: 'rent:2028-02-01:2028-03-01',
  description: 'Agreed rent',
  periodStart: '2028-02-01',
  periodEnd: '2028-03-01',
  dueDate: '2028-02-05',
  amountPaisa: money(1800001n),
};
export type SystemProofFault = 'audit' | 'ack' | 'advance' | 'execution' | 'wrong_item';
// Real constraint fixture; not an admission, occupancy or registered-worker acceptance claim.
export async function systemPostingFixture(
  tx: PostingTransaction,
  scope: FinanceScope,
  omit?: SystemProofFault,
) {
  const f = await billingScheduleFixture(tx, scope);
  await tx.insert(residentBillingSchedules).values(f.value);
  const executionId = v7(),
    leaseExpiresAt = new Date(f.now.getTime() + 60000);
  await tx
    .update(notificationOutbox)
    .set({ leaseToken: f.leaseToken, leaseExpiresAt })
    .where(eq(notificationOutbox.id, f.jobId));
  const result = await postPlannedResidentCharge(
    tx,
    { branchId: scope.branchId, stayId: scope.stayId, agreementId: scope.agreementId, executionId },
    omit === 'wrong_item' ? { ...systemRentPlan, kind: 'mess' } : systemRentPlan,
    f.now,
  );
  if (result.status !== 'posted') throw new Error('Expected new system charge fixture');
  if (omit !== 'execution')
    await tx.insert(residentBillingExecutions).values({
      id: executionId,
      branchId: scope.branchId,
      stayId: scope.stayId,
      agreementId: scope.agreementId,
      scheduleId: f.value.id,
      jobId: f.jobId,
      leaseToken: f.leaseToken,
      leaseExpiresAt,
      scheduleVersion: 1,
      periodIndex: 0n,
      outcome: 'posted',
      sourceKey: systemRentPlan.sourceKey,
      periodStart: systemRentPlan.periodStart,
      periodEnd: systemRentPlan.periodEnd,
      dueDate: systemRentPlan.dueDate,
      amountPaisa: systemRentPlan.amountPaisa,
      chargeId: result.chargeId,
      invoiceId: result.invoiceId,
      executedAt: f.now,
    });
  await finishProof(tx, scope, f, executionId, omit);
  return { ...result, executionId, scheduleId: f.value.id, jobId: f.jobId };
}
async function finishProof(
  tx: PostingTransaction,
  scope: FinanceScope,
  f: Awaited<ReturnType<typeof billingScheduleFixture>>,
  executionId: string,
  omit?: SystemProofFault,
) {
  if (omit !== 'audit')
    await tx.insert(hostelAuditLog).values({
      organizationId: scope.organizationId,
      branchId: scope.branchId,
      actorUserId: null,
      actorRole: 'system',
      action: 'billing.execution.completed',
      targetType: 'resident_billing_execution',
      targetId: executionId,
      after: {
        scheduleId: f.value.id,
        agreementId: scope.agreementId,
        jobId: f.jobId,
        outcome: 'posted',
      },
    });
  if (omit !== 'advance')
    await tx
      .update(residentBillingSchedules)
      .set({
        version: 2,
        periodIndex: 1n,
        state: 'exhausted',
        currentJobId: null,
        nextRunAt: null,
        updatedAt: new Date(),
      })
      .where(eq(residentBillingSchedules.id, f.value.id));
  if (omit !== 'ack')
    await tx
      .update(notificationOutbox)
      .set({ status: 'sent', leaseToken: null, leaseExpiresAt: null, sentAt: new Date() })
      .where(eq(notificationOutbox.id, f.jobId));
}
