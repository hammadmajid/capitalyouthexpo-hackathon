import { z } from 'zod';
import { managementPageSchema } from './management.js';
export const citySummarySchema = z.object({ id: z.string().uuid(), name: z.string() }).strict();
export const areaSummarySchema = citySummarySchema
  .extend({
    cityId: z.string().uuid(),
    parentId: z.string().uuid().nullable(),
    level: z.enum(['zone', 'area', 'sector', 'sub_area']),
  })
  .strict();
export const areaPageInputSchema = managementPageSchema
  .extend({ parentId: z.string().uuid().optional() })
  .strict();
export const cityPageSchema = z
  .object({ data: z.array(citySummarySchema).max(100), nextCursor: z.string().uuid().nullable() })
  .strict();
export const areaPageSchema = z
  .object({ data: z.array(areaSummarySchema).max(100), nextCursor: z.string().uuid().nullable() })
  .strict();
export type AreaPageInput = z.infer<typeof areaPageInputSchema>;
