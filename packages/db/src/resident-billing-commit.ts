import { billingRunAt } from './resident-charge-plan.js';
import { and, eq, gt } from 'drizzle-orm';
import { v7 } from 'uuid';
import { z } from 'zod';
import {
  residentBillingExecutions,
  residentBillingSchedules,
  notificationOutbox,
  hostelAuditLog,
} from './schema/index.js';
import {
  RESIDENT_BILLING_EVENT,
  residentBillingJobKey,
  residentBillingJobSchema,
} from './resident-billing-job.js';
import type { PostingTransaction } from './resident-posting-context.js';
import type { LiveBillingWork } from './resident-billing-lease.js';
import type { BillingResult } from './resident-billing-run.js';
import { enqueueResidentRent } from './rent-notices.js';
function executionFacts(result: BillingResult) {
  if (result.plan === null)
    return {
      sourceKey: null,
      periodStart: null,
      periodEnd: null,
      dueDate: null,
      amountPaisa: null,
    };
  const p = result.plan;
  return {
    sourceKey: p.sourceKey,
    periodStart: p.periodStart,
    periodEnd: p.periodEnd,
    dueDate: p.dueDate,
    amountPaisa: p.amountPaisa,
  };
}
async function nextWork(
  tx: PostingTransaction,
  work: LiveBillingWork,
  result: BillingResult,
  version: number,
  periodIndex: bigint,
) {
  if (result.nextPlan === null)
    return {
      state:
        result.outcome === 'manual_required'
          ? ('manual_required' as const)
          : ('exhausted' as const),
      currentJobId: null,
      nextRunAt: null,
    };
  const currentJobId = v7(),
    nextRunAt = billingRunAt(result.nextPlan);
  const payload = { scheduleId: work.schedule.id, version, periodIndex: Number(periodIndex) };
  await tx.insert(notificationOutbox).values({
    id: currentJobId,
    eventType: RESIDENT_BILLING_EVENT,
    channel: 'internal',
    payload,
    dedupeKey: residentBillingJobKey(payload),
    nextAttemptAt: nextRunAt,
    createdAt: work.executedAt,
  });
  return { state: 'active' as const, currentJobId, nextRunAt };
}
async function advanceSchedule(
  tx: PostingTransaction,
  work: LiveBillingWork,
  result: BillingResult,
) {
  if (result.outcome === 'obsolete') return;
  const version = work.schedule.version + 1;
  const periodIndex =
    work.schedule.periodIndex +
    (['posted', 'existing', 'no_charge'].includes(result.outcome) ? 1n : 0n);
  const next = await nextWork(tx, work, result, version, periodIndex);
  await tx
    .update(residentBillingSchedules)
    .set({ ...next, version, periodIndex, updatedAt: work.executedAt })
    .where(eq(residentBillingSchedules.id, work.schedule.id));
}
async function acknowledge(tx: PostingTransaction, work: LiveBillingWork, clock: () => Date) {
  const now = z.date().parse(clock());
  if (now < work.executedAt || now >= work.job.leaseExpiresAt)
    throw new Error('Billing lease expired');
  const rows = await tx
    .update(notificationOutbox)
    .set({ status: 'sent', sentAt: now, leaseToken: null, leaseExpiresAt: null, lastError: null })
    .where(
      and(
        eq(notificationOutbox.id, work.job.id),
        eq(notificationOutbox.status, 'pending'),
        eq(notificationOutbox.leaseToken, work.job.leaseToken),
        gt(notificationOutbox.leaseExpiresAt, now),
      ),
    )
    .returning({ id: notificationOutbox.id });
  if (rows.length !== 1 || rows[0]?.id !== work.job.id)
    throw new Error('Billing lease unavailable');
}
// AUD-004 / ACC-004: all sources, history, next work and acknowledgement belong to the caller transaction.
export async function commitResidentBilling(
  tx: PostingTransaction,
  work: LiveBillingWork,
  result: BillingResult,
  id: string,
  clock: () => Date,
) {
  const s = work.schedule;
  // A stale job (its schedule since stopped, superseded or advanced) completes as obsolete
  // against the exact version and period it was issued for, which is what the guard proves.
  const issued =
    result.outcome === 'obsolete'
      ? residentBillingJobSchema.parse(work.job.payload)
      : { version: s.version, periodIndex: Number(s.periodIndex) };
  await tx.insert(residentBillingExecutions).values({
    id,
    branchId: s.branchId,
    stayId: s.stayId,
    agreementId: s.agreementId,
    scheduleId: s.id,
    jobId: work.job.id,
    leaseToken: work.job.leaseToken,
    leaseExpiresAt: work.job.leaseExpiresAt,
    scheduleVersion: issued.version,
    periodIndex: BigInt(issued.periodIndex),
    outcome: result.outcome,
    ...executionFacts(result),
    chargeId: result.chargeId,
    invoiceId: result.invoiceId,
    executedAt: work.executedAt,
  });
  await advanceSchedule(tx, work, result);
  // RENT-001 / NTF-001: a newly issued period invoice announces rent due, exactly once.
  if (result.outcome === 'posted' && result.invoiceId !== null)
    await enqueueResidentRent(
      tx,
      { event: 'rent.due', stayId: s.stayId, invoiceId: result.invoiceId },
      work.executedAt,
    );
  await tx.insert(hostelAuditLog).values({
    organizationId: work.organizationId,
    branchId: s.branchId,
    actorUserId: null,
    actorRole: 'system',
    action: 'billing.execution.completed',
    targetType: 'resident_billing_execution',
    targetId: id,
    after: {
      scheduleId: s.id,
      agreementId: s.agreementId,
      jobId: work.job.id,
      outcome: result.outcome,
    },
  });
  await acknowledge(tx, work, clock);
}
