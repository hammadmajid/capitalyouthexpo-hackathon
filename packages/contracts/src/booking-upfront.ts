import { z } from 'zod';
import { calendarDateSchema } from './dates.js';
import { moneyJsonSchema } from './money.js';
import { externalPaymentMethodSchema } from './finance-payments.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const text = (maximum: number) => z.string().trim().min(1).max(maximum);
export const upfrontRequirementSchema = z.enum(['deposit', 'first_rent', 'deposit_and_first_rent']);
// SRS p.21–22: Approved → Payment Pending → Verification Pending → Confirmed (SRS v2.11).
export const upfrontStatusSchema = z.enum([
  'awaiting_approval',
  'awaiting_payment',
  'verification_pending',
  'verified',
]);
export const bookingPaymentProofSchema = z
  .object({
    id,
    state: z.enum(['submitted', 'approved', 'rejected']),
    amountPaisa: moneyJsonSchema,
    method: externalPaymentMethodSchema,
    paidOn: calendarDateSchema,
    reference: z.string().nullable(),
    submittedAt: z.string().datetime(),
    reviewedAt: z.string().datetime().nullable(),
    reviewReason: z.string().nullable(),
  })
  .strict()
  .refine(
    (proof) =>
      (proof.state === 'submitted') === (proof.reviewedAt === null) &&
      (proof.state === 'rejected') === (proof.reviewReason !== null),
    'Proof review metadata is inconsistent',
  );
export const bookingUpfrontSchema = z
  .object({
    requirement: z.enum(['none', 'deposit', 'first_rent', 'deposit_and_first_rent']),
    amountPaisa: moneyJsonSchema.refine((value) => value > 0),
    status: upfrontStatusSchema,
    approvedAt: z.string().datetime().nullable(),
    proof: bookingPaymentProofSchema.nullable(),
  })
  .strict()
  .refine((value) => {
    const proof = value.proof?.state;
    if (value.status === 'awaiting_approval') return value.approvedAt === null && !proof;
    if (value.approvedAt === null) return false;
    if (value.status === 'awaiting_payment') return !proof || proof === 'rejected';
    if (value.status === 'verification_pending') return proof === 'submitted';
    return proof === 'approved';
  }, 'Upfront status is inconsistent');
export const paymentInstructionInputSchema = z
  .object({
    method: externalPaymentMethodSchema,
    accountTitle: text(120),
    accountIdentifier: text(80),
    instructions: text(500).nullable(),
  })
  .strict();
export const paymentInstructionSchema = paymentInstructionInputSchema
  .extend({ id, branchId: id, createdAt: z.string().datetime() })
  .strict();
export const paymentInstructionListSchema = z
  .object({ branchId: id, data: z.array(paymentInstructionSchema).max(10) })
  .strict();
export const bookingProofInputSchema = z
  .object({
    fileId: id,
    amountPaisa: moneyJsonSchema.refine((value) => value > 0),
    method: externalPaymentMethodSchema,
    paidOn: calendarDateSchema,
    reference: text(120).nullable(),
  })
  .strict();
export const bookingProofReviewSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('approve') }).strict(),
  z.object({ decision: z.literal('reject'), reason: text(500) }).strict(),
]);
export type BookingUpfront = z.infer<typeof bookingUpfrontSchema>;
export type BookingPaymentProof = z.infer<typeof bookingPaymentProofSchema>;
export type PaymentInstruction = z.infer<typeof paymentInstructionSchema>;
export type PaymentInstructionInput = z.infer<typeof paymentInstructionInputSchema>;
export type BookingProofInput = z.infer<typeof bookingProofInputSchema>;
export type BookingProofReview = z.infer<typeof bookingProofReviewSchema>;
// BKG-005: the upfront amount is only the disclosed deposit and/or one disclosed monthly rent.
export function upfrontAmountPaisa(
  requirement: z.infer<typeof upfrontRequirementSchema>,
  price: { monthlyRentPaisa: number; depositPaisa: number },
) {
  const deposit = requirement === 'first_rent' ? 0n : BigInt(price.depositPaisa),
    rent = requirement === 'deposit' ? 0n : BigInt(price.monthlyRentPaisa);
  return deposit + rent;
}
// BKG-007: Owner policy; changes apply to requests created afterwards (BKG-004 capture).
export const upfrontSettingsSchema = z
  .object({
    requirement: z.enum(['none', 'deposit', 'first_rent', 'deposit_and_first_rent']),
    proofRetryAllowed: z.boolean(),
  })
  .strict();
export type UpfrontSettings = z.infer<typeof upfrontSettingsSchema>;
