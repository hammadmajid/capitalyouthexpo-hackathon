import { z } from 'zod';
import { moneyJsonSchema } from './money.js';
import { stayIdentifierSchema, stayPrivateText } from './stay-values.js';

// FIN-004 / CHG-009: immutable disclosed unit prices, never an arbitrary free-form charge amount.
export const billingCatalogSnapshotSchema = z
  .object({
    catalogId: stayIdentifierSchema,
    code: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
    name: stayPrivateText(120),
    unitLabel: stayPrivateText(40),
    unitAmountPaisa: moneyJsonSchema.gt(0),
  })
  .strict();
export const billingCatalogSnapshotsSchema = z
  .array(billingCatalogSnapshotSchema)
  .max(32)
  .refine(
    (rows) => new Set(rows.map((row) => row.catalogId)).size === rows.length,
    'Duplicate disclosed catalog entry',
  );
