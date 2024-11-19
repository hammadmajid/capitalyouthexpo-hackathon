import { z } from 'zod';
import { cnicSchema } from './identity.js';
import { inventoryTargetSchema } from './booking-availability.js';
import { instantSchema } from './dates.js';
import { databaseDateSchema } from './database-dates.js';
import { inventoryPageQuerySchema } from './inventory-pages.js';
import { billingAgreementTermsSchema } from './billing-policy.js';
import { moneyJsonSchema } from './money.js';
import {
  residentReferenceInputSchema,
  stayIdentifierSchema,
  databaseStayPeriodSchema,
  stayPrivateText,
  stayStateSchema,
  stayVersionSchema,
} from './stay-values.js';
const reason = stayPrivateText(500);
// CHG-054: CNIC is typed at check-in only when the customer's account has none on file.
export const bookingCheckInInputSchema = z
  .object({ policyVersionId: stayIdentifierSchema, cnic: cnicSchema.optional() })
  .strict();
export const manualStayInputSchema = z
  .object({
    resident: residentReferenceInputSchema,
    target: inventoryTargetSchema,
    period: databaseStayPeriodSchema,
    terms: billingAgreementTermsSchema,
  })
  .strict()
  .refine(
    (value) => value.period.expectedLeaveDate !== null || value.terms.policy.allowOpenEnded,
    'Open-ended stays require an explicit policy',
  )
  .refine(
    (value) => value.terms.policy.cycle.kind !== 'term' || value.period.expectedLeaveDate !== null,
    'Term billing requires an explicit term end',
  );
export type ManualStayInput = z.infer<typeof manualStayInputSchema>;
export const stayTransferInputSchema = z
  .object({
    expectedVersion: stayVersionSchema,
    target: inventoryTargetSchema,
    effectiveAt: instantSchema.optional(),
    reason,
    // P9-FIX-01: a different rent is explicit and agreed with the resident, never inferred.
    repricing: z
      .object({ rentAmountPaisa: moneyJsonSchema, residentAgreed: z.literal(true) })
      .strict()
      .optional(),
  })
  .strict();
export const stayExtensionInputSchema = z
  .object({
    expectedVersion: stayVersionSchema,
    expectedLeaveDate: databaseDateSchema,
    reason,
  })
  .strict();
export const stayNoticeInputSchema = z
  .object({
    expectedVersion: stayVersionSchema,
    requestedCheckoutDate: databaseDateSchema,
    isEmergency: z.boolean(),
    reason: reason.optional(),
  })
  .strict()
  .refine(
    (value) => !value.isEmergency || value.reason !== undefined,
    'Emergency departure requires a reason',
  );
// OUT-003/005: caller requests an operation, never supplies authoritative balances.
export const stayCheckoutInputSchema = z
  .object({
    expectedVersion: stayVersionSchema,
    reason,
    applyAvailableDeposit: z.boolean(),
  })
  .strict();
export const stayTerminationInputSchema = z
  .object({
    expectedVersion: stayVersionSchema,
    reason,
    kind: z.enum(['terminated', 'abandoned']),
    effectiveAt: instantSchema.optional(),
  })
  .strict();
export const stayAgreementAmendmentInputSchema = z
  .object({
    expectedVersion: stayVersionSchema,
    effectiveFrom: databaseDateSchema,
    terms: billingAgreementTermsSchema,
    reason,
  })
  .strict();
export const stayDirectoryQuerySchema = inventoryPageQuerySchema.extend({
  state: stayStateSchema.optional(),
  q: z.string().trim().min(1).max(100).optional(),
  roomId: stayIdentifierSchema.optional(),
  bedId: stayIdentifierSchema.optional(),
});
