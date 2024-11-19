import { z } from 'zod';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export const listingAmenityCodeSchema = z.string().regex(/^[a-z][a-z0-9_]{1,47}$/);
export const listingVersionSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const listingPreconditionSchema = z
  .string()
  .regex(/^"[a-f0-9]{64}"$/)
  .transform((value) => value.slice(1, -1));
export const listingFieldsSchema = z
  .object({
    description: z.string().trim().min(1).max(4000).nullable(),
    nearbyLandmark: z.string().trim().min(1).max(1000).nullable(),
    publicPhone: z
      .string()
      .trim()
      .regex(/^\+[1-9][0-9]{6,14}$/)
      .nullable(),
    publicEmail: z
      .string()
      .trim()
      .max(254)
      .email()
      .transform((value) => value.toLowerCase())
      .nullable(),
    showPublicContact: z.boolean(),
  })
  .strict();
export const listingSettingsInputSchema = listingFieldsSchema
  .extend({
    amenityCodes: z
      .array(listingAmenityCodeSchema)
      .max(100)
      .refine((values) => new Set(values).size === values.length),
  })
  .strict();
export const selectedListingAmenitySchema = z
  .object({
    code: listingAmenityCodeSchema,
    name: z.string().min(1).max(80),
    isActive: z.boolean(),
  })
  .strict();
export const privateListingSchema = listingFieldsSchema
  .extend({
    branchId: id,
    version: listingVersionSchema,
    canEdit: z.boolean(),
    amenities: z.array(selectedListingAmenitySchema).max(100),
  })
  .strict();
export const amenityCatalogQuerySchema = z
  .object({
    cursor: listingAmenityCodeSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export const amenityCatalogPageSchema = z
  .object({
    data: z
      .array(z.object({ code: listingAmenityCodeSchema, name: z.string().min(1).max(80) }).strict())
      .max(100),
    nextCursor: listingAmenityCodeSchema.nullable(),
  })
  .strict();
export type ListingFields = z.infer<typeof listingFieldsSchema>;
export type ListingSettingsInput = z.infer<typeof listingSettingsInputSchema>;
export type PrivateListing = z.infer<typeof privateListingSchema>;
export type AmenityCatalogQuery = z.infer<typeof amenityCatalogQuerySchema>;
