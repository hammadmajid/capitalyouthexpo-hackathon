import { billingRunAt } from './resident-charge-plan.js';
import { and, eq } from 'drizzle-orm';
import { DomainError } from '@hsm/contracts';
import { residentBillingSchedules } from './schema/index.js';
import { readPostingContext, type PostingTransaction } from './resident-posting-context.js';
import { planAgreedCharge } from './resident-billing-plan.js';
import { authorizeResidentBilling } from './resident-billing-authorize.js';
import { changeSchedule, latestAgreement, type ScheduleActor } from './stay-schedule-changes.js';
const MAX_PERIODS = 1200;
function conflict(message: string): never {
  throw new DomainError('CONFLICT', 409, message);
}
type Context = Awaited<ReturnType<typeof readPostingContext>>;
// The Stay period index whose billing window contains `date` (fee cycle), or null after the end.
function periodContaining(context: Context, date: string) {
  for (let index = 0; index < MAX_PERIODS; index += 1) {
    const plan = planAgreedCharge(context, {
      item: 'transport',
      cadence: 'periodic',
      periodIndex: index,
    });
    if (!plan?.periodStart || !plan.periodEnd) return null;
    if (date < plan.periodEnd) return { index, start: plan.periodStart };
  }
  return null;
}
// SERV-002 / P9-M5: the caller has already written the subscription change (an approved start or
// end) in this transaction. One transport schedule per agreement bills each Stay period for the
// covered days; this makes sure it exists and is running, and refuses any date inside a period
// that transport has already invoiced, so nothing is double-charged or omitted.
export async function syncTransportBilling(
  tx: PostingTransaction,
  actor: ScheduleActor,
  input: { changedOn: string; activate: boolean },
  now: Date,
) {
  const agreement = await latestAgreement(tx, actor.branchId, actor.stayId);
  const context = await readPostingContext(tx, {
    branchId: actor.branchId,
    stayId: actor.stayId,
    agreementId: agreement.id,
  });
  const target = periodContaining(context, input.changedOn);
  if (!target) conflict('The date is outside the Stay billing periods');
  if (target.start < agreement.effectiveFrom)
    conflict('Choose a date on or after ' + agreement.effectiveFrom);
  const [schedule] = await tx
    .select()
    .from(residentBillingSchedules)
    .where(
      and(
        eq(residentBillingSchedules.agreementId, agreement.id),
        eq(residentBillingSchedules.item, 'transport'),
        eq(residentBillingSchedules.cadence, 'periodic'),
      ),
    )
    .for('update');
  if (schedule && BigInt(target.index) < schedule.periodIndex)
    conflict('Transport for that period is already invoiced; choose a later date');
  if (!schedule) {
    if (!input.activate) return null;
    return authorizeResidentBilling(
      tx,
      {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        stayId: actor.stayId,
        agreementId: agreement.id,
        actorUserId: actor.actorUserId,
        actorRole: actor.actorRole,
        dispatch: 'on_due_date',
        item: 'transport',
        cadence: 'periodic',
        periodIndex: target.index,
      },
      now,
    );
  }
  if (schedule.state === 'exhausted' && input.activate) {
    const plan = planAgreedCharge(context, {
      item: 'transport',
      cadence: 'periodic',
      periodIndex: Number(schedule.periodIndex),
    });
    if (!plan) return null;
    if (plan.amountPaisa === null) {
      await changeSchedule(tx, actor, schedule, 'manual_required', now);
      return null;
    }
    const due = billingRunAt(plan);
    await changeSchedule(tx, actor, schedule, 'active', now, due < now ? now : due);
  }
  return null;
}
