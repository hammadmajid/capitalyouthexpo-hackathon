import { z } from 'zod';
import { instantSchema } from './dates.js';
import { stayIdentifierSchema as id } from './stay-values.js';
import { verificationDecisionInputSchema, verificationStatusSchema } from './platform-admin.js';
export const verificationPageQuerySchema = z
  .object({
    cursor: id.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export const verificationEvidenceAccessSchema = z
  .object({
    justification: z.string().trim().min(8).max(500),
  })
  .strict();
export const verificationCommandInputSchema = verificationDecisionInputSchema
  .extend({
    expectedStatus: verificationStatusSchema.optional(),
    expectedUpdatedAt: instantSchema.optional(),
  })
  .strict();
export const verificationEvidenceSchema = z
  .object({
    fileId: id,
    side: z.enum(['front', 'back']),
    mimeType: z.string(),
    sizeBytes: z.string().regex(/^[0-9]+$/),
    available: z.boolean(),
  })
  .strict();
export const verificationDossierSchema = z
  .object({
    branchId: id,
    branchName: z.string(),
    organizationName: z.string(),
    status: verificationStatusSchema,
    updatedAt: instantSchema,
    submittedAt: instantSchema.nullable(),
    completenessScore: z.number().int().min(0).max(100).nullable(),
    category: z.string().nullable(),
    addressLine: z.string().nullable(),
    description: z.string().nullable(),
    cityId: id.nullable(),
    areaId: id.nullable(),
    location: z
      .object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) })
      .strict()
      .nullable(),
    publicPhone: z.string().nullable(),
    publicEmail: z.string().nullable(),
    showPublicContact: z.boolean(),
    propertyTier: z.string().nullable(),
    establishmentYear: z.number().int().nullable(),
    owner: z
      .object({
        fullName: z.string(),
        cnicLast4: z.string().length(4).nullable(),
        profileCompletedAt: instantSchema.nullable(),
      })
      .strict(),
    evidence: z.array(verificationEvidenceSchema).max(2),
    source: z.literal('current_record'),
  })
  .strict();
export const verificationHistoryItemSchema = z
  .object({
    id,
    fromStatus: verificationStatusSchema,
    toStatus: verificationStatusSchema,
    reason: z.string().nullable(),
    reviewerName: z.string(),
    createdAt: instantSchema,
  })
  .strict();
export const verificationHistorySchema = z
  .object({
    data: z.array(verificationHistoryItemSchema).max(50),
    nextCursor: id.nullable(),
  })
  .strict();
export type VerificationDossier = z.infer<typeof verificationDossierSchema>;
export type VerificationHistory = z.infer<typeof verificationHistorySchema>;
export const verificationPricingSchema = z
  .object({
    data: z
      .array(
        z
          .object({
            id,
            name: z.string(),
            inventoryMode: z.enum(['per_bed', 'whole_room', 'both']),
            capacity: z.number().int().positive(),
            bedMonthlyRentPaisa: z
              .string()
              .regex(/^[0-9]+$/)
              .nullable(),
            roomMonthlyRentPaisa: z
              .string()
              .regex(/^[0-9]+$/)
              .nullable(),
            depositPaisa: z.string().regex(/^[0-9]+$/),
          })
          .strict(),
      )
      .max(50),
    nextCursor: id.nullable(),
  })
  .strict();
export const verificationPhotosSchema = z
  .object({
    data: z
      .array(
        z
          .object({
            id,
            fileId: id,
            roomId: id.nullable(),
            seatId: id.nullable(),
            altText: z.string(),
            mimeType: z.string(),
            available: z.boolean(),
          })
          .strict(),
      )
      .max(50),
    nextCursor: id.nullable(),
  })
  .strict();
