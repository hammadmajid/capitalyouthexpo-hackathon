import { z } from 'zod';
import { billingAgreementTermsSchema } from './billing-policy.js';
import { stayPeriodSchema } from './stay-values.js';
import { moneyJsonSchema, type Money } from './money.js';
import { DomainError } from './errors.js';
import { addRentDays, rentDays, rentMonth } from './rent-calendar.js';
import { prorateRent } from './rent-proration.js';
const inputSchema = z
  .object({
    stay: stayPeriodSchema,
    terms: billingAgreementTermsSchema,
    periodIndex: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    manualAmountPaisa: moneyJsonSchema.optional(),
  })
  .strict();
type Input = z.infer<typeof inputSchema>;
export interface RentPeriod {
  periodIndex: number;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  baseStart: string;
  baseEnd: string;
  amountPaisa: Money | null;
}
function interval(input: Input) {
  const cycle = input.terms.policy.cycle,
    anchor = input.stay.moveInDate,
    index = BigInt(input.periodIndex);
  if (cycle.kind === 'term') {
    if (input.stay.expectedLeaveDate === null)
      throw new DomainError('VALIDATION_FAILED', 400, 'Term billing requires an explicit end');
    return index === 0n
      ? {
          start: anchor,
          end: input.stay.expectedLeaveDate,
          due: addRentDays(anchor, BigInt(cycle.dueOffsetDays)),
        }
      : null;
  }
  if (cycle.kind === 'calendar_month' || cycle.kind === 'anniversary_month') {
    const day = cycle.kind === 'calendar_month' ? 1 : Number(anchor.slice(8));
    const start = rentMonth(anchor, index, day),
      end = rentMonth(anchor, index + 1n, day);
    const due =
      cycle.kind === 'calendar_month'
        ? rentMonth(anchor, index, cycle.dueDay)
        : addRentDays(start, BigInt(cycle.dueOffsetDays));
    return { start, end, due };
  }
  const days = cycle.kind === 'week' ? 7n : BigInt(cycle.periodDays),
    start = addRentDays(anchor, index * days);
  return {
    start,
    end: addRentDays(start, days),
    due: addRentDays(start, BigInt(cycle.dueOffsetDays)),
  };
}
// Computes one prospective period, never materializes an unbounded schedule.
// NULL amount means explicit manual proration is still required, never a guessed charge.
export function planRentPeriod(value: unknown): RentPeriod | null {
  const input = inputSchema.parse(value),
    end = input.stay.expectedLeaveDate;
  if (end === null && !input.terms.policy.allowOpenEnded)
    throw new DomainError('VALIDATION_FAILED', 400, 'Open-ended billing requires explicit policy');
  if (end !== null && BigInt(input.periodIndex) > rentDays(input.stay.moveInDate, end)) return null;
  const base = interval(input);
  if (!base || (end !== null && base.start >= end)) return null;
  const start = base.start < input.stay.moveInDate ? input.stay.moveInDate : base.start;
  const stop = end !== null && end < base.end ? end : base.end;
  return {
    periodIndex: input.periodIndex,
    periodStart: start,
    periodEnd: stop,
    // CHG-052: a bill is never due before the stay it charges starts, so a resident who moves
    // in after the month's due day is first billed on the move-in day (not already overdue).
    dueDate: base.due < start ? start : base.due,
    baseStart: base.start,
    baseEnd: base.end,
    amountPaisa: prorateRent(
      input.terms.policy.proration,
      BigInt(input.terms.rentAmountPaisa),
      rentDays(start, stop),
      rentDays(base.start, base.end),
      input.periodIndex === 0,
      input.manualAmountPaisa,
    ),
  };
}
