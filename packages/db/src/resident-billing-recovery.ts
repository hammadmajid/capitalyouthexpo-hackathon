import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { DomainError, stayIdentifierSchema } from '@hsm/contracts';
import type { Database } from './index.js';
import { lockInventoryBranch } from './inventory-lock.js';
import { readPostingContext, type PostingTransaction } from './resident-posting-context.js';
import {
  residentBillingJobSchema,
  residentBillingJobKey,
  RESIDENT_BILLING_EVENT,
} from './resident-billing-job.js';
import {
  notificationOutbox,
  residentBillingSchedules,
  residentBillingExecutions,
  stays,
  hostelAuditLog,
} from './schema/index.js';
const inputSchema = z
  .object({
    branchId: stayIdentifierSchema,
    jobId: stayIdentifierSchema,
    expectedAttempts: z.number().int().min(5).max(Number.MAX_SAFE_INTEGER),
    incident: z.string().regex(/^[A-Z][A-Z0-9-]{2,63}$/),
  })
  .strict();
function unavailable(): never {
  throw new DomainError('CONFLICT', 409, 'Billing recovery unavailable');
}
async function lockRecovery(tx: PostingTransaction, input: z.infer<typeof inputSchema>, now: Date) {
  const [initial] = await tx
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.id, input.jobId));
  const payload = residentBillingJobSchema.safeParse(initial?.payload);
  if (!payload.success) unavailable();
  const [target] = await tx
    .select()
    .from(residentBillingSchedules)
    .where(
      and(
        eq(residentBillingSchedules.id, payload.data.scheduleId),
        eq(residentBillingSchedules.branchId, input.branchId),
      ),
    );
  if (!target) unavailable();
  const hierarchy = await lockInventoryBranch(tx, input.branchId);
  const [stay] = await tx
    .select()
    .from(stays)
    .where(and(eq(stays.id, target.stayId), eq(stays.branchId, input.branchId)))
    .for('update');
  const [schedule] = await tx
    .select()
    .from(residentBillingSchedules)
    .where(eq(residentBillingSchedules.id, target.id))
    .for('update');
  const [job] = await tx
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.id, input.jobId))
    .for('update');
  if (
    !stay ||
    !schedule ||
    !job ||
    [hierarchy.organization, hierarchy.brand, hierarchy.branch].some(
      (row) => row.archivedAt !== null,
    ) ||
    !['active', 'notice_given', 'checkout_pending'].includes(stay.state) ||
    !stay.checkedInAt ||
    stay.checkedInAt > now ||
    stay.closedAt !== null ||
    schedule.branchId !== input.branchId ||
    schedule.stayId !== stay.id ||
    schedule.agreementId !== target.agreementId ||
    schedule.state !== 'active' ||
    schedule.currentJobId !== job.id ||
    !schedule.nextRunAt ||
    schedule.nextRunAt > now ||
    schedule.version !== payload.data.version ||
    schedule.periodIndex !== BigInt(payload.data.periodIndex) ||
    job.status !== 'dead' ||
    job.attempts !== input.expectedAttempts ||
    job.leaseToken !== null ||
    job.leaseExpiresAt !== null ||
    !['DELIVERY_FAILED', 'DELIVERY_EXHAUSTED'].includes(job.lastError ?? '') ||
    job.channel !== 'internal' ||
    job.eventType !== RESIDENT_BILLING_EVENT ||
    job.recipientUserId !== null ||
    job.recipientAddress !== null ||
    job.dedupeKey !== residentBillingJobKey(payload.data)
  )
    unavailable();
  // A locked immutable payload must still match the one used to resolve the scope.
  const current = residentBillingJobSchema.safeParse(job.payload);
  if (
    !current.success ||
    residentBillingJobKey(current.data) !== residentBillingJobKey(payload.data)
  )
    unavailable();
  const [execution] = await tx
    .select({ id: residentBillingExecutions.id })
    .from(residentBillingExecutions)
    .where(eq(residentBillingExecutions.jobId, job.id))
    .limit(1);
  if (execution) unavailable();
  await readPostingContext(tx, schedule);
  return { job, schedule, organizationId: hierarchy.organization.id };
}
// AUD-013 / RENT-004: trusted maintenance capability, like worker delivery itself.
// Never expose this function as an HTTP handler or accept an actor supplied by a client.
// Each explicit recovery grants one fresh bounded retry budget; automatic retries stay at five.
export async function recoverResidentBilling(
  database: Database,
  value: unknown,
  clock: () => Date = () => new Date(),
) {
  const input = inputSchema.parse(value),
    now = z.date().parse(clock());
  return database.transaction(async (tx) => {
    const work = await lockRecovery(tx, input, now);
    await tx.insert(hostelAuditLog).values({
      organizationId: work.organizationId,
      branchId: input.branchId,
      actorUserId: null,
      actorRole: 'system',
      action: 'billing.job.recovery.requested',
      targetType: 'notification_outbox',
      targetId: work.job.id,
      before: { status: 'dead', attempts: work.job.attempts, lastError: work.job.lastError },
      after: {
        status: 'pending',
        attempts: 0,
        incident: input.incident,
        scheduleId: work.schedule.id,
        scheduleVersion: work.schedule.version,
        periodIndex: Number(work.schedule.periodIndex),
      },
      createdAt: now,
    });
    await tx
      .update(notificationOutbox)
      .set({ status: 'pending', attempts: 0, lastError: null, nextAttemptAt: now })
      .where(eq(notificationOutbox.id, work.job.id));
    return { status: 'pending' as const };
  });
}
