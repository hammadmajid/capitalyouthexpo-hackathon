import { z } from 'zod';
import { moneyJsonSchema } from './money.js';
const days = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const monthlyBillingCycleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('calendar_month'), dueDay: z.number().int().min(1).max(31) }).strict(),
  z.object({ kind: z.literal('anniversary_month'), dueOffsetDays: days }).strict(),
]);
export const billingCycleSchema = z
  .discriminatedUnion('kind', [
    ...monthlyBillingCycleSchema.options,
    z.object({ kind: z.literal('week'), dueOffsetDays: z.number().int().min(0).max(6) }).strict(),
    z
      .object({ kind: z.literal('fixed_period'), periodDays: positive, dueOffsetDays: days })
      .strict(),
    z.object({ kind: z.literal('term'), dueOffsetDays: days }).strict(),
  ])
  .refine(
    (value) => value.kind !== 'fixed_period' || value.dueOffsetDays < value.periodDays,
    'Fixed-period due offset must be inside its period',
  );
const full = z.object({ kind: z.literal('full_period') }).strict();
const calendar = z
  .object({ kind: z.literal('calendar_days'), rounding: z.enum(['half_up', 'down', 'up']) })
  .strict();
const manual = z.object({ kind: z.literal('manual') }).strict();
export const recurringFeeProrationSchema = z.discriminatedUnion('kind', [full, calendar, manual]);
export const rentProrationSchema = z.discriminatedUnion('kind', [
  full,
  calendar,
  z.object({ kind: z.literal('fixed_first_period'), amountPaisa: moneyJsonSchema }).strict(),
  manual,
]);
