import { z } from 'zod';
import { moneyJsonSchema, stayIdentifierSchema, stayPrivateText } from '@hsm/contracts';
import { paymentScopeSchema } from './resident-payment-context.js';
const fields = { amountPaisa: moneyJsonSchema.gt(0), reason: stayPrivateText(500) };
const applied = z
  .object({
    ...fields,
    kind: z.enum(['deposit_apply', 'advance_apply']),
    invoiceId: stayIdentifierSchema,
  })
  .strict();
const settled = z
  .object({
    ...fields,
    kind: z.enum(['deposit_deduct', 'deposit_refund', 'advance_refund']),
    externalReference: stayPrivateText(160).optional(),
  })
  .strict();
export const residentFundCommandSchema = z
  .object({
    scope: paymentScopeSchema,
    paymentId: stayIdentifierSchema,
    commandId: stayIdentifierSchema,
    movement: z.union([applied, settled]),
  })
  .strict();
export type ResidentFundCommand = z.infer<typeof residentFundCommandSchema>;
export type ResidentFundInput = ResidentFundCommand['movement'];
