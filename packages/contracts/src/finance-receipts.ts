import { z } from 'zod';
import { instantSchema } from './dates.js';
import { stayIdentifierSchema, stayPrivateText } from './stay-values.js';
import { moneyJsonSchema } from './money.js';
import { residentReceiptSnapshotSchema } from './finance-payments.js';
// FIN-001 / PAY-008: authorized private projection only. Original financial facts are immutable.
export const residentReceiptDetailSchema = z
  .object({
    receiptId: stayIdentifierSchema,
    receiptNumber: stayPrivateText(64),
    issuedAt: instantSchema,
    snapshot: residentReceiptSnapshotSchema,
    reversed: z.boolean(),
  })
  .strict();
export type ResidentReceiptDetail = z.infer<typeof residentReceiptDetailSchema>;
export const recordedResidentPaymentSchema = z
  .object({
    paymentId: stayIdentifierSchema,
    receiptId: stayIdentifierSchema,
    receiptNumber: stayPrivateText(64),
    amountPaisa: moneyJsonSchema.gt(0),
  })
  .strict();
export type RecordedResidentPayment = z.infer<typeof recordedResidentPaymentSchema>;
