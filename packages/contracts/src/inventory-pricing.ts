import { z } from 'zod';
import { calendarDateSchema } from './dates.js';
import { disclosedFeeSchema } from './booking-quote.js';
import { moneyJsonSchema } from './money.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export const roomPriceInputSchema = z
  .object({
    effectiveFrom: calendarDateSchema,
    bedMonthlyRentPaisa: moneyJsonSchema.nullable(),
    roomMonthlyRentPaisa: moneyJsonSchema.nullable(),
    depositPaisa: moneyJsonSchema,
    fees: z
      .array(disclosedFeeSchema)
      .max(32)
      .refine(
        (fees) => new Set(fees.map((fee) => fee.code + ':' + fee.cadence)).size === fees.length,
      ),
  })
  .strict();
export const roomPriceVersionSchema = roomPriceInputSchema.extend({
  id,
  branchId: id,
  roomTypeId: id,
  createdAt: z.string().datetime(),
});
export const roomPriceQuerySchema = z
  .object({
    cursor: calendarDateSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export const roomPriceHistorySchema = z
  .object({
    branchId: id,
    roomTypeId: id,
    data: z.array(roomPriceVersionSchema).max(100),
    nextCursor: calendarDateSchema.nullable(),
  })
  .strict();
export type RoomPriceInput = z.infer<typeof roomPriceInputSchema>;
