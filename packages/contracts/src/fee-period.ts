import { z } from 'zod';
import { billingAgreementTermsSchema } from './billing-policy.js';
import { disclosedFeeSchema } from './booking-quote.js';
import { stayPeriodSchema } from './stay-values.js';
import { moneyFromJson, moneyJsonSchema, type Money } from './money.js';
import { DomainError } from './errors.js';
import { addRentDays } from './rent-calendar.js';
import { planRentPeriod } from './rent-period.js';
const inputSchema = z
  .object({
    stay: stayPeriodSchema,
    terms: billingAgreementTermsSchema,
    fee: disclosedFeeSchema.pick({ code: true, cadence: true }).strict(),
    periodIndex: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    manualAmountPaisa: moneyJsonSchema.optional(),
  })
  .strict();
type Input = z.infer<typeof inputSchema>;
type Fee = z.infer<typeof disclosedFeeSchema>;
export interface AgreedFeePeriod {
  code: z.infer<typeof disclosedFeeSchema>['code'];
  cadence: z.infer<typeof disclosedFeeSchema>['cadence'];
  periodIndex: number;
  periodStart: string | null;
  periodEnd: string | null;
  dueDate: string;
  sourceKey: string;
  amountPaisa: Money | null;
}
function invalid(message: string): never {
  throw new DomainError('VALIDATION_FAILED', 400, message);
}
function oneTimePeriod(input: Input, fee: Fee, dueOffsetDays: number): AgreedFeePeriod | null {
  if (input.manualAmountPaisa !== undefined) invalid('One-time fee overrides are not allowed');
  if (input.periodIndex > 0) return null;
  return {
    code: fee.code,
    cadence: fee.cadence,
    periodIndex: input.periodIndex,
    periodStart: null,
    periodEnd: null,
    dueDate: addRentDays(input.stay.moveInDate, BigInt(dueOffsetDays)),
    sourceKey: 'fee:' + fee.code + ':one_time',
    amountPaisa: moneyFromJson(fee.amountPaisa),
  };
}
// FIN-004 / RENT-003: prospective calculation only; no posting, authorization or Paid state.
export function planAgreedFeePeriod(value: unknown): AgreedFeePeriod | null {
  const input = inputSchema.parse(value),
    fee = input.terms.fees.find(
      (item) => item.code === input.fee.code && item.cadence === input.fee.cadence,
    ),
    policy = input.terms.policy.feeBilling;
  if (!fee) invalid('An exact disclosed fee is required');
  if (!policy) invalid('Explicit fee billing policy required');
  if (input.stay.expectedLeaveDate === null) {
    if (!input.terms.policy.allowOpenEnded) invalid('Open-ended billing requires explicit policy');
    if (input.terms.policy.cycle.kind === 'term') invalid('Term billing requires an explicit end');
  }
  if (fee.cadence === 'one_time') return oneTimePeriod(input, fee, policy.oneTimeDueOffsetDays);
  if (!policy.monthly) invalid('Explicit monthly fee policy required');
  const period = planRentPeriod({
    stay: input.stay,
    terms: {
      ...input.terms,
      rentAmountPaisa: fee.amountPaisa,
      policy: {
        ...input.terms.policy,
        cycle: policy.monthly.cycle,
        proration: policy.monthly.proration,
      },
    },
    periodIndex: input.periodIndex,
    ...(input.manualAmountPaisa === undefined
      ? {}
      : { manualAmountPaisa: input.manualAmountPaisa }),
  });
  if (!period) return null;
  return {
    code: fee.code,
    cadence: fee.cadence,
    periodIndex: input.periodIndex,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    dueDate: period.dueDate,
    sourceKey: 'fee:' + fee.code + ':monthly:' + period.periodStart + ':' + period.periodEnd,
    amountPaisa: period.amountPaisa,
  };
}
