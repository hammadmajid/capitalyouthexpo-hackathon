import { z } from 'zod';
import { billingAgreementTermsSchema } from './billing-policy.js';
import { databaseDateSchema } from './database-dates.js';
import { DomainError } from './errors.js';
import { money, moneyJsonSchema, type Money } from './money.js';
import { rentDays } from './rent-calendar.js';
import { prorateRent } from './rent-proration.js';
import { planRentPeriod } from './rent-period.js';
import { stayPeriodSchema } from './stay-values.js';
const windowSchema = z
  .object({
    from: databaseDateSchema,
    to: databaseDateSchema.nullable(),
    chargePaisa: moneyJsonSchema,
  })
  .strict();
const inputSchema = z
  .object({
    stay: stayPeriodSchema,
    terms: billingAgreementTermsSchema,
    windows: z.array(windowSchema).max(64),
    periodIndex: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
export type TransportWindow = z.infer<typeof windowSchema>;
export interface TransportPeriod {
  periodIndex: number;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  issueOn?: string;
  sourceKey: string;
  amountPaisa: Money | null;
}
// SERV-002 / P9-M5: transport follows the Stay's own fee billing periods (the approved monthly
// fee cycle) and charges each period only for the days an approved subscription covered it,
// with the approved recurring-fee proration. No subscription in a period means no charge.
export function planTransportPeriod(value: unknown): TransportPeriod | null {
  const input = inputSchema.parse(value);
  const policy = input.terms.policy.transportBilling;
  const transport = policy && 'dueDay' in policy ? policy : undefined;
  const monthly = transport
    ? {
        cycle: ['calendar_month', 'anniversary_month'].includes(input.terms.policy.cycle.kind)
          ? input.terms.policy.cycle
          : { kind: 'calendar_month' as const, dueDay: transport.dueDay },
        proration: transport.proration,
      }
    : input.terms.policy.feeBilling?.monthly;
  if (monthly && ['calendar_month', 'anniversary_month'].includes(input.terms.policy.cycle.kind))
    monthly.cycle = input.terms.policy.cycle;
  if (!monthly)
    throw new DomainError('CONFLICT', 409, 'Transport billing needs a monthly fee billing policy');
  const period = planRentPeriod({
    stay: input.stay,
    terms: {
      ...input.terms,
      rentAmountPaisa: 0,
      policy: { ...input.terms.policy, cycle: monthly.cycle, proration: { kind: 'full_period' } },
    },
    periodIndex: input.periodIndex,
  });
  if (!period) return null;
  const total = rentDays(period.baseStart, period.baseEnd);
  let amount: bigint | null = 0n;
  let firstCovered: string | undefined;
  for (const window of input.windows) {
    const start = window.from > period.periodStart ? window.from : period.periodStart;
    const end = window.to !== null && window.to < period.periodEnd ? window.to : period.periodEnd;
    if (start >= end) continue;
    if (firstCovered === undefined || start < firstCovered) firstCovered = start;
    const part = prorateRent(
      monthly.proration,
      BigInt(window.chargePaisa),
      rentDays(start, end),
      total,
      false,
      undefined,
    );
    amount = part === null || amount === null ? null : amount + part;
  }
  return {
    periodIndex: input.periodIndex,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    dueDate: period.dueDate,
    ...(firstCovered
      ? { issueOn: firstCovered > period.dueDate ? firstCovered : period.dueDate }
      : {}),
    sourceKey: 'transport:' + period.periodStart + ':' + period.periodEnd,
    amountPaisa: amount === null ? null : money(amount),
  };
}
