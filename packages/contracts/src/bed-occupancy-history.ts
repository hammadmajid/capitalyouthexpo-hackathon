import { z } from 'zod';
import { instantSchema } from './dates.js';
import { stayIdentifierSchema as id } from './stay-values.js';
const cursorParts = z.tuple([instantSchema, id]);
export const bedHistoryCursorSchema = z
  .string()
  .max(80)
  .refine(
    (value) => cursorParts.safeParse(value.split('|')).success,
    'Invalid history continuation',
  );
export const bedHistoryQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: bedHistoryCursorSchema.optional(),
  })
  .strict();
export type BedHistoryQuery = z.infer<typeof bedHistoryQuerySchema>;
export const bedOccupancyHistoryRowSchema = z
  .object({
    assignmentId: id,
    stayId: id,
    residentName: z.string(),
    startedAt: instantSchema,
    endedAt: instantSchema.nullable(),
    wholeRoom: z.boolean(),
  })
  .strict()
  .refine(
    (row) => row.endedAt === null || Date.parse(row.endedAt) >= Date.parse(row.startedAt),
    'Invalid assignment dates',
  );
export const bedOccupancyHistoryPageSchema = z
  .object({
    branchId: id,
    bedId: id,
    data: z.array(bedOccupancyHistoryRowSchema).max(50),
    nextCursor: bedHistoryCursorSchema.nullable(),
  })
  .strict()
  .refine(
    (page) => new Set(page.data.map((row) => row.assignmentId)).size === page.data.length,
    'Duplicate assignment',
  );
