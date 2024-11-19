import { z } from 'zod';
import { instantSchema } from './dates.js';
import { moneyJsonSchema } from './money.js';
import { stayIdentifierSchema, stayPrivateText } from './stay-values.js';

const base = z.object({
  id: stayIdentifierSchema,
  branchId: stayIdentifierSchema,
  stayId: stayIdentifierSchema,
  amountPaisa: moneyJsonSchema.gt(0),
  postedAt: instantSchema,
});
// FIN-001 / PAY-008: internal immutable postings reference their real source record.
// These are not generic ledger-write HTTP request bodies.
export const residentLedgerPostingSchema = z.discriminatedUnion('kind', [
  base.extend({ kind: z.literal('charge'), chargeId: stayIdentifierSchema }).strict(),
  base
    .extend({
      kind: z.literal('approved_payment'),
      paymentId: stayIdentifierSchema,
      receiptId: stayIdentifierSchema,
    })
    .strict(),
  base
    .extend({
      kind: z.literal('adjustment'),
      adjustmentId: stayIdentifierSchema,
      direction: z.enum(['debit', 'credit']),
    })
    .strict(),
  base
    .extend({
      kind: z.literal('reversal'),
      reversedEntryId: stayIdentifierSchema,
      reason: stayPrivateText(500),
    })
    .strict(),
]);
export type ResidentLedgerPosting = z.infer<typeof residentLedgerPostingSchema>;
