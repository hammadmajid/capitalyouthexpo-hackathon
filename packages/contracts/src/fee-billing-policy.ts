import { z } from 'zod';
import { monthlyBillingCycleSchema, recurringFeeProrationSchema } from './billing-values.js';
// FIN-004 / RENT-003: fees retain disclosed cadence; there are no guessed timing defaults.
export const feeBillingPolicySchema = z
  .object({
    oneTimeDueOffsetDays: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    monthly: z
      .object({ cycle: monthlyBillingCycleSchema, proration: recurringFeeProrationSchema })
      .strict()
      .optional(),
  })
  .strict();
export type FeeBillingPolicy = z.infer<typeof feeBillingPolicySchema>;
