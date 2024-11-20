import { postCombinedResidentCharge } from './resident-combined-billing.js';
import { readPostingContext, type PostingTransaction } from './resident-posting-context.js';
import { planScheduledResidentCharge } from './resident-billing-plan.js';
import type { PendingResidentCharge } from './resident-charge-plan.js';
import type { LiveBillingWork } from './resident-billing-lease.js';
import type { residentBillingExecutions } from './schema/index.js';
export type BillingResult = {
  outcome: typeof residentBillingExecutions.$inferInsert.outcome;
  plan: PendingResidentCharge | null;
  nextPlan: PendingResidentCharge | null;
  chargeId: string | null;
  invoiceId: string | null;
};
export const obsoleteBillingResult: BillingResult = {
  outcome: 'obsolete',
  plan: null,
  nextPlan: null,
  chargeId: null,
  invoiceId: null,
};
export async function runCurrentResidentBilling(
  tx: PostingTransaction,
  work: LiveBillingWork,
  executionId: string,
): Promise<BillingResult> {
  assertLiveStay(work);
  if (work.schedule.nextRunAt === null || work.schedule.nextRunAt > work.executedAt)
    throw new Error('Billing schedule not due');
  const context = await readPostingContext(tx, work.schedule);
  const selection = {
    item: work.schedule.item,
    cadence: work.schedule.cadence,
    periodIndex: Number(work.schedule.periodIndex),
  };
  const plan = planScheduledResidentCharge(context, selection);
  if (!plan) return { ...obsoleteBillingResult, outcome: 'no_period' };
  if (plan.amountPaisa === null)
    return { ...obsoleteBillingResult, outcome: 'manual_required', plan };
  const posted = await postCombinedResidentCharge(
    tx,
    {
      branchId: work.schedule.branchId,
      stayId: work.schedule.stayId,
      agreementId: work.schedule.agreementId,
      executionId,
    },
    { ...plan, amountPaisa: plan.amountPaisa },
    work.executedAt,
    context,
  );
  const outcome = posted.status === 'already_posted' ? 'existing' : posted.status;
  const nextPlan = planScheduledResidentCharge(context, {
    ...selection,
    periodIndex: selection.periodIndex + 1,
  });
  return { outcome, plan, nextPlan, chargeId: posted.chargeId, invoiceId: posted.invoiceId };
}

function assertLiveStay(work: LiveBillingWork) {
  if (
    !work.operational ||
    !['active', 'notice_given', 'checkout_pending'].includes(work.stay.state) ||
    work.stay.checkedInAt === null ||
    work.stay.checkedInAt > work.executedAt ||
    work.stay.closedAt !== null
  )
    throw new Error('Billing stay unavailable');
}
