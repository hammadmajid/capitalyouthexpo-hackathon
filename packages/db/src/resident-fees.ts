import { z } from 'zod';
import {
  disclosedFeeSchema,
  DomainError,
  moneyJsonSchema,
  planAgreedFeePeriod,
} from '@hsm/contracts';
import {
  postingScopeSchema,
  postingConflict,
  readPostingContext,
  type PostingTransaction,
} from './resident-posting-context.js';
import { postPlannedResidentCharge } from './resident-charge-posting.js';
import { feeChargePlan } from './resident-charge-plan.js';
const commandSchema = postingScopeSchema
  .extend({
    fee: disclosedFeeSchema.pick({ code: true, cadence: true }).strict(),
    periodIndex: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    manualAmountPaisa: moneyJsonSchema.optional(),
  })
  .strict();
// FIN-004 / RENT-003: human-only agreed fee persistence inside the caller transaction.
// Live authorization/branch locks must precede this call; mandatory audit/outbox must follow.
export async function postAgreedFeePeriod(
  transaction: PostingTransaction,
  value: unknown,
  clock: Date,
) {
  const input = commandSchema.parse(value),
    now = z.date().parse(clock),
    context = await readPostingContext(transaction, input);
  const period = planAgreedFeePeriod({
    stay: {
      moveInDate: context.stay.moveInDate,
      expectedLeaveDate: context.stay.expectedLeaveDate,
    },
    terms: context.terms,
    fee: input.fee,
    periodIndex: input.periodIndex,
    ...(input.manualAmountPaisa === undefined
      ? {}
      : { manualAmountPaisa: input.manualAmountPaisa }),
  });
  if (!period) return { status: 'no_period' as const, chargeId: null, invoiceId: null };
  if ((period.periodStart ?? context.stay.moveInDate) < context.agreement.effectiveFrom)
    postingConflict();
  const plan = feeChargePlan(period);
  if (plan.amountPaisa === null)
    throw new DomainError('VALIDATION_FAILED', 400, 'Explicit partial fee amount required');
  return postPlannedResidentCharge(
    transaction,
    {
      branchId: input.branchId,
      stayId: input.stayId,
      agreementId: input.agreementId,
      actorUserId: input.actorUserId,
    },
    { ...plan, amountPaisa: plan.amountPaisa },
    now,
  );
}
