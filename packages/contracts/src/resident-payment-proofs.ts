import { z } from 'zod';
import { instantSchema } from './dates.js';
import { databaseDateSchema } from './database-dates.js';
import { moneyJsonSchema } from './money.js';
import { externalPaymentMethodSchema } from './finance-payments.js';
import { stayIdentifierSchema as id, stayPrivateText } from './stay-values.js';
// PAY-001..003 / ACC-004: a resident's evidence of a direct payment to the hostel for one
// of their own issued invoices. Submission never changes a balance or marks anything paid.
export const residentProofInputSchema = z
  .object({
    invoiceId: id.optional(),
    fileId: id,
    amountPaisa: moneyJsonSchema.gt(0),
    depositPaisa: moneyJsonSchema.optional(),
    method: externalPaymentMethodSchema.exclude(['cash']),
    paidOn: databaseDateSchema,
    reference: stayPrivateText(120).optional(),
    // CHG-050: other bills of the same Stay paid in the same transfer (e.g. transport with
    // rent); amountPaisa is then the total. One screenshot, one review, one receipt.
    alsoInvoiceIds: z.array(id).max(11).optional(),
  })
  .strict()
  .refine(
    (value) =>
      new Set([value.invoiceId, ...(value.alsoInvoiceIds ?? [])]).size ===
      1 + (value.alsoInvoiceIds?.length ?? 0),
    'Each bill appears once',
  )
  .refine(
    (value) => (value.depositPaisa ?? 0) <= value.amountPaisa,
    'Security deposit exceeds the payment total',
  )
  .refine(
    (value) =>
      value.invoiceId !== undefined ||
      ((value.depositPaisa ?? 0) > 0 && !value.alsoInvoiceIds?.length),
    'Choose a bill or a security deposit',
  );
export type ResidentProofInput = z.infer<typeof residentProofInputSchema>;
export const residentProofStateSchema = z.enum(['submitted', 'approved', 'rejected']);
export const residentProofSchema = z
  .object({
    id,
    branchId: id,
    stayId: id,
    invoiceId: id.nullable(),
    invoiceNumber: z.string().nullable(),
    // CHG-050: every bill this proof pays, main bill first (one entry for a single bill).
    invoices: z
      .array(z.object({ invoiceId: id, invoiceNumber: z.string() }).strict())
      .min(0)
      .max(12)
      .optional(),
    amountPaisa: moneyJsonSchema,
    depositPaisa: moneyJsonSchema.optional(),
    method: externalPaymentMethodSchema,
    paidOn: databaseDateSchema,
    reference: z.string().nullable(),
    state: residentProofStateSchema,
    reviewReason: z.string().nullable(),
    paymentId: id.nullable(),
    // The approved payment's immutable receipt (PAY-009), once approval has committed.
    receiptId: id.nullable(),
    submittedAt: instantSchema,
    reviewedAt: instantSchema.nullable(),
  })
  .strict()
  .refine(
    (row) =>
      (row.state === 'approved') === (row.paymentId !== null) &&
      (row.state === 'approved') === (row.receiptId !== null) &&
      (row.state === 'rejected') === (row.reviewReason !== null) &&
      (row.state === 'submitted') === (row.reviewedAt === null),
    'Inconsistent payment proof state',
  );
export type ResidentProof = z.infer<typeof residentProofSchema>;
export const residentPaymentSummarySchema = z
  .object({
    stayId: id,
    branchId: id,
    requiredDepositPaisa: moneyJsonSchema,
    receivedDepositPaisa: moneyJsonSchema,
    outstandingDepositPaisa: moneyJsonSchema,
    pendingDepositPaisa: moneyJsonSchema,
  })
  .strict();
export const residentProofPageQuerySchema = z
  .object({
    state: residentProofStateSchema.optional(),
    cursor: id.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
// PAY-004: the staff queue may narrow to one Stay (e.g. the resident on a Bed Board bed).
export const staffProofPageQuerySchema = residentProofPageQuerySchema
  .extend({ stayId: id.optional() })
  .strict();
export const residentProofPageSchema = z
  .object({ data: z.array(residentProofSchema).max(50), nextCursor: id.nullable() })
  .strict();
// Staff queue rows add the resident and the invoice's current authoritative outstanding.
export const staffProofSchema = z
  .object({
    proof: residentProofSchema,
    residentName: z.string(),
    roomLabel: z.string().nullable(),
    bedLabel: z.string().nullable(),
    // CHG-050: the total still owed on every bill the proof covers.
    invoiceOutstandingPaisa: moneyJsonSchema,
    depositOutstandingPaisa: moneyJsonSchema.optional(),
    // PAY-005: the submitted amount differs from what is still owed on the invoice.
    amountMismatch: z.boolean(),
  })
  .strict();
export const staffProofPageSchema = z
  .object({ data: z.array(staffProofSchema).max(50), nextCursor: id.nullable() })
  .strict();
export const proofReviewInputSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('approve') }).strict(),
  z.object({ decision: z.literal('reject'), reason: stayPrivateText(500) }).strict(),
]);
export type ProofReviewInput = z.infer<typeof proofReviewInputSchema>;
