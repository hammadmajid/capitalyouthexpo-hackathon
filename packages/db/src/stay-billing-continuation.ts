import { billingRunAt } from './resident-charge-plan.js';
import { and, eq, gt, inArray, lt } from 'drizzle-orm';
import { money } from '@hsm/contracts';
import { residentBillingSchedules, residentCharges } from './schema/index.js';
import { readPostingContext, type PostingTransaction } from './resident-posting-context.js';
import { planAgreedCharge, type BillingContext } from './resident-billing-plan.js';
import { originalChargesOnly, postPlannedResidentCharge } from './resident-charge-posting.js';
import { enqueueResidentRent } from './rent-notices.js';
import { changeSchedule, latestAgreement, type ScheduleActor } from './stay-schedule-changes.js';
type Schedule = typeof residentBillingSchedules.$inferSelect;
type Outcome = {
  scheduleId: string;
  item: Schedule['item'];
  result: 'topped_up' | 'manual_top_up_required' | 'resumed' | 'manual_required';
};
const label = {
  rent: 'Rent',
  mess: 'Mess',
  utilities: 'Utilities',
  admission: 'Admission',
  transport: 'Transport',
};
// P9-FIX-02 / RENT-004: after the Stay's expected departure moves, the period that was cut
// short by the old date is topped up to its amount under the new dates (the same agreed
// proration rule; a full-period policy already billed it, so the difference is zero), and an
// exhausted schedule resumes at its own cursor. Nothing earlier is backfilled or rewritten.
export async function continueBillingAfterExtension(
  tx: PostingTransaction,
  actor: ScheduleActor,
  today: string,
  now: Date,
) {
  const agreement = await latestAgreement(tx, actor.branchId, actor.stayId);
  const context = await readPostingContext(tx, {
    branchId: actor.branchId,
    stayId: actor.stayId,
    agreementId: agreement.id,
  });
  const schedules = await tx
    .select()
    .from(residentBillingSchedules)
    .where(
      and(
        eq(residentBillingSchedules.agreementId, agreement.id),
        eq(residentBillingSchedules.cadence, 'periodic'),
        inArray(residentBillingSchedules.state, ['active', 'manual_required', 'exhausted']),
      ),
    )
    .for('update');
  const outcomes: Outcome[] = [];
  for (const schedule of schedules) {
    const topUp = await topUpShortPeriod(tx, actor, context, schedule, today, now);
    if (topUp) outcomes.push({ scheduleId: schedule.id, item: schedule.item, result: topUp });
    if (schedule.state !== 'exhausted') continue;
    const plan = planAgreedCharge(context, {
      item: schedule.item,
      cadence: 'periodic',
      periodIndex: Number(schedule.periodIndex),
    });
    if (!plan) continue;
    if (plan.amountPaisa === null) {
      await changeSchedule(tx, actor, schedule, 'manual_required', now);
      outcomes.push({ scheduleId: schedule.id, item: schedule.item, result: 'manual_required' });
      continue;
    }
    const due = billingRunAt(plan);
    await changeSchedule(tx, actor, schedule, 'active', now, due < now ? now : due);
    outcomes.push({ scheduleId: schedule.id, item: schedule.item, result: 'resumed' });
  }
  return outcomes;
}
async function topUpShortPeriod(
  tx: PostingTransaction,
  actor: ScheduleActor,
  context: BillingContext,
  schedule: Schedule,
  today: string,
  now: Date,
) {
  if (schedule.periodIndex === 0n) return null;
  const full = planAgreedCharge(context, {
    item: schedule.item,
    cadence: 'periodic',
    periodIndex: Number(schedule.periodIndex - 1n),
  });
  if (!full?.periodStart || !full.periodEnd) return null;
  if (full.periodStart < context.agreement.effectiveFrom) return null;
  const billed = await tx
    .select({ amount: residentCharges.amountPaisa, end: residentCharges.periodEnd })
    .from(residentCharges)
    .where(
      and(
        eq(residentCharges.branchId, actor.branchId),
        eq(residentCharges.stayId, actor.stayId),
        eq(residentCharges.kind, schedule.item),
        lt(residentCharges.periodStart, full.periodEnd),
        gt(residentCharges.periodEnd, full.periodStart),
        originalChargesOnly(),
      ),
    )
    .limit(32);
  const covered = billed.reduce<string | null>(
    (latest, row) => (row.end && (!latest || row.end > latest) ? row.end : latest),
    null,
  );
  if (!covered || covered >= full.periodEnd) return null;
  if (full.amountPaisa === null) return 'manual_top_up_required';
  const already = billed.reduce((sum, row) => sum + row.amount, 0n);
  const amountPaisa = full.amountPaisa - already;
  if (amountPaisa <= 0n) return null;
  const posting = await postPlannedResidentCharge(
    tx,
    {
      branchId: actor.branchId,
      stayId: actor.stayId,
      agreementId: context.agreement.id,
      actorUserId: actor.actorUserId,
    },
    {
      kind: schedule.item,
      sourceKey: schedule.item + ':' + covered + ':' + full.periodEnd,
      description: label[schedule.item] + ' ' + covered + ' to ' + full.periodEnd + ' (extension)',
      periodStart: covered,
      periodEnd: full.periodEnd,
      dueDate: full.dueDate > today ? full.dueDate : today,
      amountPaisa: money(amountPaisa),
    },
    now,
  );
  if (posting.status === 'posted' && posting.invoiceId)
    await enqueueResidentRent(
      tx,
      { event: 'rent.due', stayId: actor.stayId, invoiceId: posting.invoiceId },
      now,
    );
  return 'topped_up';
}
