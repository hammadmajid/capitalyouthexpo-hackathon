import { z } from 'zod';
import { managementPageSchema } from './management.js';
import { inventoryTargetSchema, stayRangeSchema } from './booking-availability.js';
export const inventoryBlockInputSchema = z
  .object({
    target: inventoryTargetSchema,
    range: stayRangeSchema,
    kind: z.enum(['manual', 'maintenance']),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();
export const inventoryBlockReleaseSchema = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();
export const inventoryBlockStateSchema = z
  .object({
    id: z.string().uuid(),
    branchId: z.string().uuid(),
    target: inventoryTargetSchema,
    range: stayRangeSchema,
    kind: z.enum(['manual', 'maintenance']),
    releasedAt: z.string().datetime().nullable(),
  })
  .strict();
export type InventoryBlockInput = z.infer<typeof inventoryBlockInputSchema>;

export const inventoryBlockListQuerySchema = managementPageSchema
  .extend({
    state: z.enum(['unreleased', 'released', 'all']).default('unreleased'),
  })
  .strict();
export const inventoryBlockSummarySchema = inventoryBlockStateSchema
  .extend({
    roomLabel: z.string(),
    bedLabel: z.string().nullable(),
    createdAt: z.string().datetime(),
  })
  .refine(
    (value) => (value.target.kind === 'bed') === (value.bedLabel !== null),
    'Bed labels require a bed target',
  );
export const inventoryBlockPageSchema = z
  .object({
    data: z.array(inventoryBlockSummarySchema).max(100),
    nextCursor: z.string().uuid().nullable(),
  })
  .strict();
export type InventoryBlockListQuery = z.infer<typeof inventoryBlockListQuerySchema>;
