import { z } from 'zod';
import {
  DomainError,
  planRentPeriod,
  planAgreedFeePeriod,
  planTransportPeriod,
} from '@hsm/contracts';
import { feeChargePlan, rentChargePlan, transportChargePlan } from './resident-charge-plan.js';
import { postingConflict, type readPostingContext } from './resident-posting-context.js';
const selectionSchema = z
  .object({
    item: z.enum(['rent', 'mess', 'utilities', 'admission', 'transport']),
    cadence: z.enum(['periodic', 'one_time']),
    periodIndex: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
export type BillingContext = Awaited<ReturnType<typeof readPostingContext>>;
// RENT-004 / FIN-002: use only immutable agreed planners; missing manual amounts stay unresolved.
export function planScheduledResidentCharge(context: BillingContext, value: unknown) {
  const plan = planAgreedCharge(context, value);
  if (plan && (plan.periodStart ?? context.stay.moveInDate) < context.agreement.effectiveFrom)
    postingConflict();
  return plan;
}
// P9-FIX-01/02: the same agreed planner without the agreement-start check, for callers that
// must inspect a period that began before an amendment.
export function planAgreedCharge(context: BillingContext, value: unknown) {
  const input = selectionSchema.parse(value);
  const common = {
    stay: {
      moveInDate: context.stay.moveInDate,
      expectedLeaveDate: context.stay.expectedLeaveDate,
    },
    terms: context.terms,
    periodIndex: input.periodIndex,
  };
  if ((input.item === 'rent' || input.item === 'transport') && input.cadence !== 'periodic')
    throw new DomainError('INTERNAL', 500, 'Billing schedule unavailable');
  if (input.item === 'transport') {
    const period = planTransportPeriod({
      stay: common.stay,
      terms: context.terms,
      windows: context.transport,
      periodIndex: input.periodIndex,
    });
    return period ? transportChargePlan(period) : null;
  }
  const plan =
    input.item === 'rent'
      ? rentPlan(common)
      : feePlan({
          ...common,
          fee: {
            code: input.item,
            cadence: input.cadence === 'periodic' ? ('monthly' as const) : ('one_time' as const),
          },
        });
  return plan;
}
function rentPlan(input: Parameters<typeof planRentPeriod>[0]) {
  const period = planRentPeriod(input);
  return period ? rentChargePlan(period) : null;
}
function feePlan(input: Parameters<typeof planAgreedFeePeriod>[0]) {
  const period = planAgreedFeePeriod(input);
  return period ? feeChargePlan(period) : null;
}
