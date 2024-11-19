import { z } from 'zod';
import { billingAgreementTermsSchema } from './billing-policy.js';
import { databaseDateSchema } from './database-dates.js';
import { stayNoticeInputSchema } from './stay-commands.js';
import { addRentDays, rentDays } from './rent-calendar.js';
// OUT-001/002: disclose original agreed notice timing; never infer a fee,
// waive a policy, release inventory or reject an emergency just for short notice.
const inputSchema = z
  .object({
    submittedOn: databaseDateSchema,
    terms: billingAgreementTermsSchema,
    notice: stayNoticeInputSchema,
  })
  .strict()
  .refine(
    (value) => value.notice.requestedCheckoutDate >= value.submittedOn,
    'A new departure notice cannot request a past checkout date',
  );
export function planStayNotice(value: unknown) {
  const { submittedOn, terms, notice } = inputSchema.parse(value);
  const requiredDays = terms.policy.noticeDays;
  const provided = rentDays(submittedOn, notice.requestedCheckoutDate);
  const shortfall = BigInt(requiredDays) > provided ? BigInt(requiredDays) - provided : 0n;
  return {
    submittedOn,
    requestedCheckoutDate: notice.requestedCheckoutDate,
    earliestCompliantCheckoutDate: addRentDays(submittedOn, BigInt(requiredDays)),
    requiredNoticeDays: requiredDays,
    providedNoticeDays: Number(provided),
    shortfallDays: Number(shortfall),
    isEmergency: notice.isEmergency,
    policyVersionId: terms.policyVersionId,
  };
}
export type StayNoticePlan = ReturnType<typeof planStayNotice>;
