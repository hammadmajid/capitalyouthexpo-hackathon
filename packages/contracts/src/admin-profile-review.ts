import { z } from 'zod';
import { cnicSchema } from './identity.js';
import { instantSchema } from './dates.js';
import { stayIdentifierSchema as id } from './stay-values.js';
const reason = z.string().trim().min(8).max(500);
const version = z.number().int().positive().max(2147483647);
export const identityCorrectionInputSchema = z
  .object({
    fullName: z.string().trim().min(2).max(150).optional(),
    cnic: cnicSchema.optional(),
    reason,
    evidenceFileIds: z
      .array(id)
      .min(1)
      .max(3)
      .refine((ids) => new Set(ids).size === ids.length)
      .describe(
        'Own private evidence IDs. A CNIC correction requires front at position 0 and back at position 1.',
      ),
  })
  .strict()
  .superRefine((input, context) => {
    if (!input.fullName && !input.cnic)
      context.addIssue({ code: 'custom', message: 'Provide a name or CNIC correction' });
    if (input.cnic && input.evidenceFileIds.length < 2)
      context.addIssue({
        code: 'custom',
        path: ['evidenceFileIds'],
        message: 'CNIC front and back evidence are required',
      });
  });
export const profilePhotoSubmissionSchema = z.object({ fileId: id, reason }).strict();
export const profileReviewQuerySchema = z
  .object({
    cursor: id.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    status: z
      .enum(['pending', 'approved', 'rejected', 'cancelled', 'withdrawn'])
      .default('pending'),
  })
  .strict();
export const identityCorrectionDecisionSchema = z
  .object({ action: z.enum(['approve', 'reject']), expectedVersion: version, reason })
  .strict();
export const profilePhotoDecisionSchema = z
  .object({ action: z.enum(['approve', 'reject', 'withdraw']), expectedVersion: version, reason })
  .strict();
export const profileReviewCancelSchema = z.object({ expectedVersion: version, reason }).strict();
export const profileReviewAccessSchema = z.object({ justification: reason }).strict();
// HMA-015: queue/history metadata never contains proposed identity, keys or document URLs.
export const profileReviewMetadataSchema = z
  .object({
    id,
    userId: id,
    kind: z.enum(['identity', 'profile_photo']),
    status: z.enum(['pending', 'approved', 'rejected', 'cancelled', 'withdrawn']),
    version,
    submittedAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict();
export const profileReviewPageSchema = z
  .object({ data: z.array(profileReviewMetadataSchema).max(50), nextCursor: id.nullable() })
  .strict();

export const profileReviewHistoryQuerySchema = z
  .object({
    cursor: z.coerce.number().int().min(2).max(2147483647).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export const profileReviewHistoryPageSchema = z
  .object({
    data: z
      .array(
        z
          .object({
            version,
            actorId: id,
            action: z.enum(['approve', 'reject', 'withdraw', 'cancel']),
            reason,
            createdAt: instantSchema,
          })
          .strict(),
      )
      .max(50),
    nextCursor: z.number().int().min(2).nullable(),
  })
  .strict();
export const profileReviewDetailSchema = z
  .object({
    review: profileReviewMetadataSchema,
    reason,
    previousFullName: z.string().nullable(),
    proposedFullName: z.string().nullable(),
    previousCnicLast4: z
      .string()
      .regex(/^\d{4}$/)
      .nullable(),
    proposedCnic: z
      .string()
      .regex(/^\d{13}$/)
      .nullable(),
    previousPhotoFileId: id.nullable(),
    proposedPhotoFileId: id.nullable(),
    currentPhoto: z.boolean(),
    evidenceFileIds: z.array(id).max(3),
  })
  .strict();

export const profilePhotoSubjectPageSchema = z
  .object({
    data: z.array(z.object({ userId: id, fileId: id, updatedAt: instantSchema }).strict()).max(50),
    nextCursor: id.nullable(),
  })
  .strict();
