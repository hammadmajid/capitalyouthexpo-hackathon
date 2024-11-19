import { z } from 'zod';
import { databaseDateSchema } from './database-dates.js';
import { stayIdentifierSchema, stayPrivateText } from './stay-values.js';
// CHG-053 / RENT-003: an Owner cancels a wrong, wholly unpaid bill and issues the same charge
// again with a corrected due date. The cancelled bill stays on record (voided, with reason).
export const invoiceReissueInputSchema = z
  .object({ dueDate: databaseDateSchema, reason: stayPrivateText(500) })
  .strict();
export type InvoiceReissueInput = z.infer<typeof invoiceReissueInputSchema>;
export const invoiceReissueResultSchema = z
  .object({ voidedInvoiceId: stayIdentifierSchema, invoiceId: stayIdentifierSchema })
  .strict();
export type InvoiceReissueResult = z.infer<typeof invoiceReissueResultSchema>;
