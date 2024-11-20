import { z } from 'zod';
import { DomainError, moneyJsonSchema, planRentPeriod } from '@hsm/contracts';
import {
  postingScopeSchema,
  postingConflict,
  readPostingContext,
  type PostingTransaction,
} from './resident-posting-context.js';
import { postCombinedResidentCharge } from './resident-combined-billing.js';
import { rentChargePlan } from './resident-charge-plan.js';
const commandSchema = postingScopeSchema
  .extend({
    periodIndex: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    manualAmountPaisa: moneyJsonSchema.optional(),
  })
  .strict();
// RENT-003/004: human-only agreed rent persistence inside the caller transaction.
// Caller authorizes live scope first and appends mandatory audit/outbox before commit.
export async function postAgreedRentPeriod(
  transaction: PostingTransaction,
  value: unknown,
  clock: Date,
) {
  const input = commandSchema.parse(value),
    now = z.date().parse(clock),
    context = await readPostingContext(transaction, input);
  const period = planRentPeriod({
    stay: {
      moveInDate: context.stay.moveInDate,
      expectedLeaveDate: context.stay.expectedLeaveDate,
    },
    terms: context.terms,
    periodIndex: input.periodIndex,
    ...(input.manualAmountPaisa === undefined
      ? {}
      : { manualAmountPaisa: input.manualAmountPaisa }),
  });
  if (!period) return { status: 'no_period' as const, chargeId: null, invoiceId: null };
  if (period.periodStart < context.agreement.effectiveFrom) postingConflict();
  const plan = rentChargePlan(period);
  if (plan.amountPaisa === null)
    throw new DomainError('VALIDATION_FAILED', 400, 'Explicit partial rent amount required');
  return postCombinedResidentCharge(
    transaction,
    {
      branchId: input.branchId,
      stayId: input.stayId,
      agreementId: input.agreementId,
      actorUserId: input.actorUserId,
    },
    { ...plan, amountPaisa: plan.amountPaisa },
    now,
    context,
  );
}
