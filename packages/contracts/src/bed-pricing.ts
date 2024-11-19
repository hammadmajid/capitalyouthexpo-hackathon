import { z } from 'zod';
import { calendarDateSchema } from './dates.js';
import { moneyJsonSchema } from './money.js';
import { stayIdentifierSchema as id } from './stay-values.js';
// CHG-056 / BKG-004: independently versioned physical-bed rent; existing snapshots stay fixed.
export const bedRentInputSchema = z
  .object({
    effectiveFrom: calendarDateSchema,
    monthlyRentPaisa: moneyJsonSchema,
    depositPaisa: moneyJsonSchema.optional(),
  })
  .strict();
export const bedRentVersionSchema = bedRentInputSchema
  .extend({
    id,
    branchId: id,
    roomId: id,
    bedId: id,
    createdAt: z.string().datetime(),
    depositPaisa: moneyJsonSchema.nullable().optional(),
  })
  .strict();
export const bedRentQuerySchema = z
  .object({ cursor: id.optional(), limit: z.coerce.number().int().min(1).max(50).default(20) })
  .strict();
export const bedRentPageSchema = z
  .object({
    branchId: id,
    roomId: id,
    bedId: id,
    bedLabel: z.string(),
    canEdit: z.boolean(),
    current: z
      .object({
        monthlyRentPaisa: moneyJsonSchema,
        depositPaisa: moneyJsonSchema.optional(),
        priceVersionId: id.nullable(),
        effectiveFrom: calendarDateSchema.nullable(),
      })
      .strict()
      .nullable(),
    data: z.array(bedRentVersionSchema).max(50),
    nextCursor: id.nullable(),
  })
  .strict();
export type BedRentInput = z.infer<typeof bedRentInputSchema>;
