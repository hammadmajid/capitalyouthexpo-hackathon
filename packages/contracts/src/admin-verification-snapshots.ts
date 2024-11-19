import { z } from 'zod';
import { stayIdentifierSchema as id } from './stay-values.js';
import { instantSchema } from './dates.js';
import {
  verificationDossierSchema,
  verificationPhotosSchema,
  verificationPricingSchema,
} from './admin-verification.js';
export const verificationSnapshotSchema = z
  .object({ id, submittedAt: instantSchema, dossier: verificationDossierSchema })
  .strict();
export const verificationSnapshotComparisonSchema = z
  .object({
    current: verificationSnapshotSchema.nullable(),
    lastApproved: verificationSnapshotSchema.nullable(),
    changedFields: z
      .array(
        z.enum([
          'branchName',
          'organizationName',
          'category',
          'addressLine',
          'description',
          'cityId',
          'areaId',
          'location',
          'publicPhone',
          'publicEmail',
          'showPublicContact',
          'propertyTier',
          'establishmentYear',
          'owner',
          'evidence',
          'pricing',
          'photos',
        ]),
      )
      .max(18),
    historicalSnapshotUnavailable: z.boolean(),
  })
  .strict();
export const verificationSnapshotItemQuerySchema = z
  .object({
    kind: z.enum(['pricing', 'photo']),
    cursor: id.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export const verificationSnapshotItemSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('pricing'),
      sourceId: id,
      data: verificationPricingSchema.shape.data.element,
    })
    .strict(),
  z
    .object({
      kind: z.literal('photo'),
      sourceId: id,
      data: verificationPhotosSchema.shape.data.element,
    })
    .strict(),
]);
export const verificationSnapshotItemsSchema = z
  .object({ data: z.array(verificationSnapshotItemSchema).max(50), nextCursor: id.nullable() })
  .strict();
const fields = [
  'branchName',
  'organizationName',
  'category',
  'addressLine',
  'description',
  'cityId',
  'areaId',
  'location',
  'publicPhone',
  'publicEmail',
  'showPublicContact',
  'propertyTier',
  'establishmentYear',
  'owner',
  'evidence',
] as const;
export function verificationSnapshotDiff(
  current: z.infer<typeof verificationDossierSchema>,
  approved: z.infer<typeof verificationDossierSchema>,
) {
  return fields.filter(
    (field) => JSON.stringify(current[field]) !== JSON.stringify(approved[field]),
  );
}
