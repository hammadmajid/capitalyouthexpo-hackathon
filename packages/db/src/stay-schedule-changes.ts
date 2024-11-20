import { and, desc, eq } from 'drizzle-orm';
import { v7 } from 'uuid';
import { DomainError } from '@hsm/contracts';
import {
  hostelAuditLog,
  notificationOutbox,
  residentBillingSchedules,
  stayAgreements,
} from './schema/index.js';
import type { PostingTransaction } from './resident-posting-context.js';
import { RESIDENT_BILLING_EVENT, residentBillingJobKey } from './resident-billing-job.js';
export type ScheduleActor = {
  organizationId: string;
  branchId: string;
  stayId: string;
  actorUserId: string;
  actorRole: 'owner' | 'manager';
};
type Schedule = typeof residentBillingSchedules.$inferSelect;
type NextState = 'active' | 'manual_required' | 'stopped' | 'superseded';
// RENT-004 / AUD-004: every human schedule change writes the exact before/after audit row the
// progress guard requires, in the caller's transaction. Resuming work issues a fresh job.
export async function changeSchedule(
  tx: PostingTransaction,
  actor: ScheduleActor,
  schedule: Schedule,
  state: NextState,
  now: Date,
  runAt?: Date,
) {
  const version = schedule.version + 1;
  let currentJobId: string | null = null;
  if (state === 'active') {
    if (!runAt) throw new DomainError('INTERNAL', 500, 'Billing resume time unavailable');
    currentJobId = v7();
    const payload = {
      scheduleId: schedule.id,
      version,
      periodIndex: Number(schedule.periodIndex),
    };
    await tx.insert(notificationOutbox).values({
      id: currentJobId,
      eventType: RESIDENT_BILLING_EVENT,
      channel: 'internal',
      payload,
      dedupeKey: residentBillingJobKey(payload),
      nextAttemptAt: runAt,
      createdAt: now,
    });
  }
  const periodIndex = Number(schedule.periodIndex);
  await tx.insert(hostelAuditLog).values({
    organizationId: actor.organizationId,
    branchId: actor.branchId,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: 'billing.schedule.changed',
    targetType: 'resident_billing_schedule',
    targetId: schedule.id,
    before: {
      version: schedule.version,
      state: schedule.state,
      periodIndex,
      currentJobId: schedule.currentJobId,
    },
    after: { version, state, periodIndex, currentJobId },
    createdAt: now,
  });
  await tx
    .update(residentBillingSchedules)
    .set({
      version,
      state,
      currentJobId,
      nextRunAt: state === 'active' ? (runAt ?? null) : null,
      updatedAt: now,
    })
    .where(eq(residentBillingSchedules.id, schedule.id));
}
export async function latestAgreement(tx: PostingTransaction, branchId: string, stayId: string) {
  const [agreement] = await tx
    .select()
    .from(stayAgreements)
    .where(and(eq(stayAgreements.branchId, branchId), eq(stayAgreements.stayId, stayId)))
    .orderBy(desc(stayAgreements.version))
    .limit(1);
  if (!agreement) throw new DomainError('INTERNAL', 500, 'Stay agreement unavailable');
  return agreement;
}
