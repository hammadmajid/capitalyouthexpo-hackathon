import { z } from 'zod';
import { databaseDateSchema } from './database-dates.js';
import { stayIdentifierSchema, stayVersionSchema } from './stay-values.js';
import { addRentDays, rentDays } from './rent-calendar.js';
const days = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const plan = z
  .object({
    submittedOn: databaseDateSchema,
    requestedCheckoutDate: databaseDateSchema,
    earliestCompliantCheckoutDate: databaseDateSchema,
    requiredNoticeDays: days,
    providedNoticeDays: days,
    shortfallDays: days,
    isEmergency: z.boolean(),
    policyVersionId: stayIdentifierSchema,
  })
  .strict();
function consistent(value: z.infer<typeof plan>) {
  try {
    const provided = rentDays(value.submittedOn, value.requestedCheckoutDate),
      required = BigInt(value.requiredNoticeDays),
      shortfall = required > provided ? required - provided : 0n;
    return (
      provided >= 0n &&
      provided === BigInt(value.providedNoticeDays) &&
      shortfall === BigInt(value.shortfallDays) &&
      addRentDays(value.submittedOn, required) === value.earliestCompliantCheckoutDate
    );
  } catch {
    return false;
  }
}
// OUT-001/002/006: immutable timing disclosure, never a fee or an inventory-release command.
export const stayNoticePlanSchema = plan.refine(
  consistent,
  'Notice timing must match the original disclosed calendar',
);
export const stayNoticeResultSchema = z
  .object({
    noticeId: stayIdentifierSchema,
    stayId: stayIdentifierSchema,
    state: z.literal('notice_given'),
    version: stayVersionSchema.refine((value) => value > 1),
    plan: stayNoticePlanSchema,
  })
  .strict();
export type StayNoticeResult = z.infer<typeof stayNoticeResultSchema>;
