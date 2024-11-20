import { planRentPeriod, DomainError } from '@hsm/contracts';
import { planAgreedCharge, type BillingContext } from './resident-billing-plan.js';
import {
  postPlannedResidentCharge,
  postPlannedResidentChargeBatch,
  type PlannedResidentCharge,
} from './resident-charge-posting.js';
import type { FinancialPostingScope, PostingTransaction } from './resident-posting-context.js';
// SERV-002 / RENT-004: one monthly rent invoice, separate charge lines and ledger attribution.
export async function postCombinedResidentCharge(
  tx: PostingTransaction,
  scope: FinancialPostingScope,
  plan: PlannedResidentCharge,
  now: Date,
  context: BillingContext,
) {
  if (plan.amountPaisa === 0n) return postPlannedResidentCharge(tx, scope, plan, now);
  const monthly = ['calendar_month', 'anniversary_month'].includes(context.terms.policy.cycle.kind);
  if (!monthly || !context.transport.length || !['rent', 'transport'].includes(plan.kind))
    return postPlannedResidentCharge(tx, scope, plan, now);
  const index = periodIndex(context, plan.periodStart);
  const other = planAgreedCharge(context, {
    item: plan.kind === 'rent' ? 'transport' : 'rent',
    cadence: 'periodic',
    periodIndex: index,
  });
  if (!other || other.amountPaisa === 0n) return postPlannedResidentCharge(tx, scope, plan, now);
  if (other.amountPaisa === null)
    throw new DomainError(
      'CONFLICT',
      409,
      'Confirm the partial rent/transport amount before issuing the combined invoice',
    );
  const companion = { ...other, amountPaisa: other.amountPaisa };
  const plans = plan.kind === 'rent' ? [plan, companion] : [companion, plan];
  const results = await postPlannedResidentChargeBatch(
    tx,
    scope,
    plans,
    now,
    plan.kind === 'rent' ? 0 : 1,
  );
  const result = results[plan.kind === 'rent' ? 0 : 1];
  if (!result) throw new DomainError('INTERNAL', 500, 'Combined invoice unavailable');
  return result;
}
function periodIndex(context: BillingContext, start: string | null) {
  for (let index = 0; index < 1200; index += 1) {
    const period = planRentPeriod({
      stay: {
        moveInDate: context.stay.moveInDate,
        expectedLeaveDate: context.stay.expectedLeaveDate,
      },
      terms: {
        ...context.terms,
        policy: { ...context.terms.policy, proration: { kind: 'full_period' } },
      },
      periodIndex: index,
    });
    if (!period || period.periodStart > (start ?? '')) break;
    if (period.periodStart === start) return index;
  }
  throw new DomainError('CONFLICT', 409, 'Transport must use the rent billing period');
}
