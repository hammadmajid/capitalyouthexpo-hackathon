import { z } from 'zod';
import { instantSchema } from './dates.js';
import { databaseDateSchema } from './database-dates.js';
import { moneyJsonSchema } from './money.js';
import { stayIdentifierSchema, stayPrivateText } from './stay-values.js';
import { paymentDistributionSchema } from './finance-balances.js';

export const externalPaymentMethodSchema = z.enum([
  'cash',
  'bank_transfer',
  'jazzcash',
  'easypaisa',
  'other',
]);
const allocation = z
  .object({ invoiceId: stayIdentifierSchema, amountPaisa: moneyJsonSchema.gt(0) })
  .strict();
const allocations = z
  .array(allocation)
  .max(100)
  .refine(
    (rows) => new Set(rows.map((row) => row.invoiceId)).size === rows.length,
    'Combine allocations to the same invoice before submitting',
  );
function allocationTotal(rows: readonly { amountPaisa: number }[]) {
  if (!rows.every((row) => moneyJsonSchema.safeParse(row.amountPaisa).success)) return null;
  return rows.reduce((sum, row) => sum + BigInt(row.amountPaisa), 0n);
}
export const recordExternalPaymentInputSchema = z
  .object({
    amountPaisa: moneyJsonSchema.gt(0),
    method: externalPaymentMethodSchema,
    transactionReference: stayPrivateText(160).optional(),
    proofFileId: stayIdentifierSchema.optional(),
    paidOn: databaseDateSchema,
    note: stayPrivateText(500),
    allocations,
    depositPaisa: moneyJsonSchema,
    advanceCreditPaisa: moneyJsonSchema,
  })
  .strict()
  .refine((value) => {
    const total = allocationTotal(value.allocations);
    if (total === null || total > BigInt(Number.MAX_SAFE_INTEGER)) return false;
    return paymentDistributionSchema.safeParse({
      amountPaisa: value.amountPaisa,
      allocatedPaisa: Number(total),
      depositPaisa: value.depositPaisa,
      advanceCreditPaisa: value.advanceCreditPaisa,
    }).success;
  }, 'The approved amount must exactly match invoice allocations, deposit and advance credit');
export type RecordExternalPaymentInput = z.infer<typeof recordExternalPaymentInputSchema>;
// New human collections cannot manufacture advance from an amount above the chosen total.
// The base schema remains for historical receipts and already-verified booking carryover.
export const newResidentPaymentInputSchema = recordExternalPaymentInputSchema.refine(
  (value) => value.advanceCreditPaisa === 0,
  'Payment exceeds the selected bills and security deposit total',
);

const receiptAllocation = allocation.extend({ invoiceNumber: stayPrivateText(64) }).strict();
export const residentReceiptSnapshotSchema = z
  .object({
    version: z.literal(1),
    currency: z.literal('PKR'),
    paymentId: stayIdentifierSchema,
    branchId: stayIdentifierSchema,
    stayId: stayIdentifierSchema,
    residentName: stayPrivateText(120),
    hostelName: stayPrivateText(120),
    branchName: stayPrivateText(120),
    amountPaisa: moneyJsonSchema.gt(0),
    method: externalPaymentMethodSchema,
    transactionReference: stayPrivateText(160).nullable(),
    paidOn: databaseDateSchema,
    approvedAt: instantSchema,
    allocations: z
      .array(receiptAllocation)
      .max(100)
      .refine((rows) => new Set(rows.map((row) => row.invoiceId)).size === rows.length),
    distribution: z
      .object({
        allocatedPaisa: moneyJsonSchema,
        depositPaisa: moneyJsonSchema,
        advanceCreditPaisa: moneyJsonSchema,
      })
      .strict(),
  })
  .strict()
  .refine((value) => {
    const total = allocationTotal(value.allocations);
    return (
      paymentDistributionSchema.safeParse({ amountPaisa: value.amountPaisa, ...value.distribution })
        .success &&
      total !== null &&
      total === BigInt(value.distribution.allocatedPaisa)
    );
  }, 'Receipt allocation and approved-payment totals must match');
export type ResidentReceiptSnapshot = z.infer<typeof residentReceiptSnapshotSchema>;
export const paymentReversalInputSchema = z.object({ reason: stayPrivateText(500) }).strict();
