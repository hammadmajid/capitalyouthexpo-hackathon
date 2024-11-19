import { z } from 'zod';
import { listingAmenityCodeSchema, listingVersionSchema } from './listing-settings.js';
import { stayIdentifierSchema } from './stay-values.js';
export const customAmenityInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .transform((value) => value.replace(/\s+/g, ' ')),
    category: z.enum(['connectivity', 'facilities', 'security', 'services', 'other']),
  })
  .strict();
export const customAmenitySchema = customAmenityInputSchema
  .extend({
    code: listingAmenityCodeSchema,
    organizationId: stayIdentifierSchema,
    isActive: z.boolean(),
    version: listingVersionSchema,
  })
  .strict();
export const customAmenityPageSchema = z
  .object({
    branchId: stayIdentifierSchema,
    organizationId: stayIdentifierSchema,
    data: z.array(customAmenitySchema).max(100),
    nextCursor: listingAmenityCodeSchema.nullable(),
    canEdit: z.boolean(),
  })
  .strict();
export type CustomAmenityInput = z.infer<typeof customAmenityInputSchema>;

export const customAmenityCommandSchema = z.discriminatedUnion('kind', [
  customAmenityInputSchema.extend({ kind: z.literal('create') }).strict(),
  customAmenityInputSchema
    .extend({
      kind: z.literal('edit'),
      code: listingAmenityCodeSchema,
      version: listingVersionSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('archive'),
      code: listingAmenityCodeSchema,
      version: listingVersionSchema,
      reason: z.string().trim().min(1).max(500),
    })
    .strict(),
]);
export type CustomAmenityCommand = z.infer<typeof customAmenityCommandSchema>;
