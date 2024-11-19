import { z } from 'zod';
import { bookingCheckInInputSchema } from './stay-commands.js';
import {
  admissionBillingSelectionSchema,
  manualAdmissionResultSchema,
  type AdmissionBillingSelection,
} from './manual-admission.js';
import { stayIdentifierSchema } from './stay-values.js';
import { billingAgreementTermsSchema } from './billing-policy.js';
function distinctStarts(values: AdmissionBillingSelection[]) {
  const keys = new Set(values.map((value) => value.item + ':' + value.cadence));
  return (
    keys.size === values.length &&
    values.filter((value) => value.item === 'rent').length === 1 &&
    values.some((value) => value.item === 'rent' && value.cadence === 'periodic')
  );
}
// BKG-004 / STAY-001: the server loads the original booking, customer, target and quote.
// The transaction must validate complete selections against original disclosed terms.
// This schema cannot confer consent, document approval, upfront payment or admission authority.
export const bookingAdmissionCommandSchema = bookingCheckInInputSchema
  .extend({ initialBilling: z.array(admissionBillingSelectionSchema).min(1).max(33) })
  .strict()
  .refine(
    (value) => distinctStarts(value.initialBilling),
    'Select one rent period and distinct disclosed fee starts',
  );
export type BookingAdmissionCommand = z.infer<typeof bookingAdmissionCommandSchema>;
export const bookingAdmissionResultSchema = manualAdmissionResultSchema
  .extend({ bookingId: stayIdentifierSchema })
  .strict();
export type BookingAdmissionResult = z.infer<typeof bookingAdmissionResultSchema>;
// STAY-001 / BKG-004: read-only agreement review for an authorized check-in.
export const bookingAdmissionPreviewSchema = z
  .object({
    branchId: stayIdentifierSchema,
    bookingId: stayIdentifierSchema,
    terms: billingAgreementTermsSchema,
    // CHG-054: whether the customer's account already holds a CNIC (never the number itself).
    cnicOnFile: z.boolean(),
  })
  .strict();
export type BookingAdmissionPreview = z.infer<typeof bookingAdmissionPreviewSchema>;
