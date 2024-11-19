import { z } from 'zod';
import { instantSchema } from './dates.js';
import { stayIdentifierSchema as id } from './stay-values.js';

export const moderationReviewStatusSchema = z.enum(['published', 'hidden', 'removed']);
export const moderationReportStatusSchema = z.enum([
  'open',
  'investigating',
  'actioned',
  'dismissed',
]);
const page = { cursor: id.optional(), limit: z.coerce.number().int().min(1).max(50).default(20) };
export const moderationReportQuerySchema = z
  .object({
    ...page,
    reportStatus: moderationReportStatusSchema.default('open'),
    reviewStatus: moderationReviewStatusSchema.optional(),
    reviewId: id.optional(),
  })
  .strict();
export const moderatedReviewQuerySchema = z
  .object({
    ...page,
    status: moderationReviewStatusSchema.default('hidden'),
  })
  .strict();
// REV-006 / SEC-003: no reviewer/author contacts, Stay IDs or private identity fields.
export const moderationReviewSchema = z
  .object({
    reviewId: id,
    branchId: id,
    body: z.string().nullable(),
    status: moderationReviewStatusSchema,
    moderationReason: z.string().nullable(),
    version: z.number().int().positive(),
    createdAt: instantSchema,
    editedAt: instantSchema.nullable(),
  })
  .strict();
export const moderatedReviewPageSchema = z
  .object({
    data: z.array(moderationReviewSchema).max(50),
    nextCursor: id.nullable(),
  })
  .strict();
const historyPositionSchema = z.object({ createdAt: instantSchema, id }).strict();
export function moderationHistoryPosition(cursor: string) {
  const parts = cursor.split('|');
  return historyPositionSchema.parse({
    createdAt: parts.length === 2 ? parts[0] : undefined,
    id: parts[1],
  });
}
const historyCursor = z
  .string()
  .max(100)
  .refine((value) => {
    try {
      moderationHistoryPosition(value);
      return true;
    } catch {
      return false;
    }
  }, 'Invalid moderation history cursor');
export const moderationHistoryQuerySchema = z
  .object({
    cursor: historyCursor.optional(),
    limit: page.limit,
  })
  .strict();
export const moderationHistoryItemSchema = z
  .object({
    id,
    action: z.enum(['hide_review', 'remove_review', 'restore_review', 'dismiss_report']),
    reviewerName: z.string(),
    reason: z.string(),
    reportId: id.nullable(),
    createdAt: instantSchema,
  })
  .strict();
export const moderationHistoryPageSchema = z
  .object({
    data: z.array(moderationHistoryItemSchema).max(50),
    nextCursor: historyCursor.nullable(),
  })
  .strict();
export type ModerationReview = z.infer<typeof moderationReviewSchema>;
