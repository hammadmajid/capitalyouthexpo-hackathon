import { z } from 'zod';
import { billingFormPaisa } from './billing-form-money.js';
import {
  databaseDateSchema,
  externalPaymentMethodSchema,
  moneyJsonSchema,
  newResidentPaymentInputSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
// PAY-008 / FIN-001: user-entered PKR is converted with bigint, never floats.
// Blank deposit/advance entries are invalid: the recorder must explicitly enter0.
const paisa = z
  .string()
  .transform((value, context) => {
    try {
      return billingFormPaisa(value);
    } catch {
      context.addIssue({
        code: 'custom',
        message: 'Enter a supported PKR amount with at most two decimal places',
      });
      return z.NEVER;
    }
  })
  .pipe(moneyJsonSchema);
export const externalPaymentDraftSchema = z
  .object({
    amount: paisa.pipe(moneyJsonSchema.gt(0)),
    method: externalPaymentMethodSchema,
    paidOn: databaseDateSchema,
    // PAY-008: the note is optional for staff; the stored record always carries one
    // (DB check: 1-500 chars), so an empty note is saved as a plain default.
    note: z
      .string()
      .trim()
      .max(500)
      .transform((value) => value || 'Payment recorded'),
    transactionReference: z.string().trim().max(160),
    deposit: paisa,
    advanceCredit: paisa,
    allocations: z
      .array(
        z
          .object({
            invoiceId: stayIdentifierSchema,
            amount: paisa.pipe(moneyJsonSchema.gt(0)),
          })
          .strict(),
      )
      .max(100),
    proofFileId: stayIdentifierSchema.optional(),
  })
  .strict()
  .transform((value) => ({
    amountPaisa: value.amount,
    method: value.method,
    paidOn: value.paidOn,
    note: value.note,
    allocations: value.allocations.map((row) => ({
      invoiceId: row.invoiceId,
      amountPaisa: row.amount,
    })),
    depositPaisa: value.deposit,
    advanceCreditPaisa: value.advanceCredit,
    ...(value.transactionReference ? { transactionReference: value.transactionReference } : {}),
    ...(value.proofFileId ? { proofFileId: value.proofFileId } : {}),
  }))
  .pipe(newResidentPaymentInputSchema);
export type ExternalPaymentDraft = z.input<typeof externalPaymentDraftSchema>;
