import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { lockInventoryBranch } from './inventory-lock.js';
import { residentBillingSchedules, stays, notificationOutbox } from './schema/index.js';
import {
  residentBillingJobSchema,
  residentBillingJobKey,
  InvalidResidentBillingJob,
  type ResidentBillingDelivery,
} from './resident-billing-job.js';
import type { PostingTransaction } from './resident-posting-context.js';
type Outbox = typeof notificationOutbox.$inferSelect;
type LiveOutbox = Outbox & { leaseToken: string; leaseExpiresAt: Date };
async function lockScope(tx: PostingTransaction, input: ResidentBillingDelivery) {
  const [target] = await tx
    .select()
    .from(residentBillingSchedules)
    .where(eq(residentBillingSchedules.id, input.payload.scheduleId))
    .limit(1);
  if (!target) throw new InvalidResidentBillingJob();
  const hierarchy = await lockInventoryBranch(tx, target.branchId);
  const [stay] = await tx
    .select()
    .from(stays)
    .where(and(eq(stays.branchId, target.branchId), eq(stays.id, target.stayId)))
    .for('update');
  const [schedule] = await tx
    .select()
    .from(residentBillingSchedules)
    .where(eq(residentBillingSchedules.id, target.id))
    .for('update');
  if (
    !stay ||
    !schedule ||
    stay.id !== target.stayId ||
    stay.branchId !== target.branchId ||
    schedule.id !== input.payload.scheduleId ||
    schedule.branchId !== target.branchId ||
    schedule.stayId !== target.stayId ||
    schedule.agreementId !== target.agreementId
  )
    throw new InvalidResidentBillingJob();
  return {
    stay,
    schedule,
    organizationId: hierarchy.organization.id,
    operational: [hierarchy.organization, hierarchy.brand, hierarchy.branch].every(
      (row) => row.archivedAt === null,
    ),
  };
}
function liveLease(job: Outbox, input: ResidentBillingDelivery, now: Date): job is LiveOutbox {
  return (
    job.status === 'pending' &&
    job.leaseToken !== null &&
    job.leaseToken === input.leaseToken &&
    job.leaseExpiresAt !== null &&
    job.leaseExpiresAt.getTime() === input.leaseExpiresAt.getTime() &&
    job.leaseExpiresAt > now &&
    job.nextAttemptAt <= now
  );
}
function assertMessage(job: Outbox, input: ResidentBillingDelivery) {
  const parsed = residentBillingJobSchema.safeParse(job.payload);
  if (!parsed.success) throw new InvalidResidentBillingJob();
  const expected = residentBillingJobKey(input.payload);
  if (
    job.channel !== 'internal' ||
    job.eventType !== input.eventType ||
    job.recipientUserId !== null ||
    job.recipientAddress !== null ||
    job.dedupeKey !== expected ||
    input.dedupeKey !== expected ||
    residentBillingJobKey(parsed.data) !== expected
  )
    throw new InvalidResidentBillingJob();
}
// RENT-004 / AUD-004: canonical parent -> Stay -> schedule -> outbox locking, then live proof.
export async function lockResidentBillingWork(
  tx: PostingTransaction,
  input: ResidentBillingDelivery,
  clock: () => Date,
) {
  const scope = await lockScope(tx, input);
  const [job] = await tx
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.id, input.id))
    .for('update');
  const now = z.date().parse(clock());
  if (!job || !liveLease(job, input, now)) return undefined;
  assertMessage(job, input);
  if (
    input.payload.version > scope.schedule.version ||
    BigInt(input.payload.periodIndex) > scope.schedule.periodIndex
  )
    throw new InvalidResidentBillingJob();
  return { ...scope, job, executedAt: now };
}
export type LiveBillingWork = NonNullable<Awaited<ReturnType<typeof lockResidentBillingWork>>>;
