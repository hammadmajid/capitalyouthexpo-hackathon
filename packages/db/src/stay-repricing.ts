import { and, eq, inArray } from 'drizzle-orm';
import { v7 } from 'uuid';
import { DomainError, money, moneyToJson } from '@hsm/contracts';
import { hostelAuditLog, residentBillingSchedules, stayAgreements } from './schema/index.js';
import { readPostingContext, type PostingTransaction } from './resident-posting-context.js';
import { planAgreedCharge } from './resident-billing-plan.js';
import { authorizeResidentBilling } from './resident-billing-authorize.js';
import { changeSchedule, latestAgreement, type ScheduleActor } from './stay-schedule-changes.js';
function conflict(message: string): never {
  throw new DomainError('CONFLICT', 409, message);
}
// P9-FIX-01 / RES-005 / RENT-003: a transfer to a differently priced bed amends the agreement
// with a new version; earlier versions, invoices and charges stay untouched. The new rent
// applies from the first period not yet invoiced (no new mid-period split rule is invented),
// and live schedules move to the new version through audited supersede + re-authorize.
// The caller has already moved the assignment, so the agreement guard sees the new room type.
export async function amendAgreementForTransfer(
  tx: PostingTransaction,
  actor: ScheduleActor,
  input: { rentAmountPaisa: number; reason: string; today: string },
  now: Date,
) {
  const previous = await latestAgreement(tx, actor.branchId, actor.stayId);
  const rent = money(BigInt(input.rentAmountPaisa));
  if (rent === previous.rentAmountPaisa) return null;
  const context = await readPostingContext(tx, {
    branchId: actor.branchId,
    stayId: actor.stayId,
    agreementId: previous.id,
  });
  const schedules = await tx
    .select()
    .from(residentBillingSchedules)
    .where(
      and(
        eq(residentBillingSchedules.agreementId, previous.id),
        inArray(residentBillingSchedules.state, ['active', 'manual_required', 'exhausted']),
      ),
    )
    .for('update');
  if (schedules.some((row) => row.cadence === 'one_time' && row.state !== 'exhausted'))
    conflict('Post or stop the pending one-time charge before changing the rent');
  const effectiveFrom = firstUnbilledStart(context, schedules, input.today, previous.effectiveFrom);
  const agreementId = v7();
  await tx.insert(stayAgreements).values({
    id: agreementId,
    branchId: actor.branchId,
    stayId: actor.stayId,
    version: previous.version + 1,
    effectiveFrom,
    policyVersionId: previous.policyVersionId,
    rentAmountPaisa: rent,
    depositPaisa: previous.depositPaisa,
    termsSnapshot: { ...previous.termsSnapshot, rentAmountPaisa: moneyToJson(rent) },
    bookingSnapshot: null,
    transportBillingSnapshot: previous.transportBillingSnapshot,
    reason: input.reason,
    createdByUserId: actor.actorUserId,
    createdAt: now,
  });
  await moveSchedules(tx, actor, schedules, agreementId, now);
  const terms = {
    agreementId,
    previousAgreementId: previous.id,
    previousRentPaisa: moneyToJson(money(previous.rentAmountPaisa)),
    rentAmountPaisa: input.rentAmountPaisa,
    effectiveFrom,
  };
  await auditAmendment(tx, actor, { ...terms, reason: input.reason }, now);
  return terms;
}
async function moveSchedules(
  tx: PostingTransaction,
  actor: ScheduleActor,
  schedules: Schedule[],
  agreementId: string,
  now: Date,
) {
  for (const schedule of schedules.filter((row) => row.cadence === 'periodic')) {
    if (schedule.state !== 'exhausted')
      await changeSchedule(tx, actor, schedule, 'superseded', now);
    await authorizeResidentBilling(
      tx,
      {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        stayId: actor.stayId,
        agreementId,
        actorUserId: actor.actorUserId,
        actorRole: actor.actorRole,
        dispatch: 'on_due_date',
        item: schedule.item,
        cadence: 'periodic',
        periodIndex: Number(schedule.periodIndex),
      },
      now,
    );
  }
}
async function auditAmendment(
  tx: PostingTransaction,
  actor: ScheduleActor,
  after: Record<string, unknown>,
  now: Date,
) {
  await tx.insert(hostelAuditLog).values({
    organizationId: actor.organizationId,
    branchId: actor.branchId,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: 'stay.agreement.amended',
    targetType: 'stay',
    targetId: actor.stayId,
    after,
    createdAt: now,
  });
}
type Context = Awaited<ReturnType<typeof readPostingContext>>;
type Schedule = typeof residentBillingSchedules.$inferSelect;
// The earliest start among the periods the live schedules will bill next; today when none.
export function firstUnbilledStart(
  context: Context,
  schedules: Schedule[],
  today: string,
  floor: string,
) {
  const starts = schedules
    .filter((row) => row.cadence === 'periodic' && row.state !== 'exhausted')
    .map(
      (row) =>
        planAgreedCharge(context, {
          item: row.item,
          cadence: 'periodic',
          periodIndex: Number(row.periodIndex),
        })?.periodStart,
    )
    .filter((start): start is string => typeof start === 'string');
  const earliest = starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : today;
  return earliest < floor ? floor : earliest;
}
