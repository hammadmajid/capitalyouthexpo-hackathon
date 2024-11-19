import { z } from 'zod';
import { instantSchema } from './dates.js';
import { addRentDays } from './rent-calendar.js';
import { stayIdentifierSchema as id, stayPrivateText, stayVersionSchema } from './stay-values.js';
const text = stayPrivateText;
// CMP-002: approved categories; CMP-004: Open → Assigned → In Progress → Resolved →
// (resident accepts) Closed, or Reopened by the resident while the issue remains.
export const complaintCategorySchema = z.enum([
  'electricity',
  'plumbing',
  'wifi',
  'cleaning',
  'furniture',
  'ac',
  'geyser',
  'mess',
  'security',
  'staff',
  'other',
]);
export const complaintStatusSchema = z.enum([
  'open',
  'assigned',
  'in_progress',
  'resolved',
  'reopened',
  'closed',
]);
export type ComplaintStatus = z.infer<typeof complaintStatusSchema>;
export const complaintInputSchema = z
  .object({
    category: complaintCategorySchema,
    title: text(120),
    description: text(2000),
    attachmentFileIds: z.array(id).max(5).default([]),
  })
  .strict();
export const complaintEventSchema = z
  .object({
    id,
    actorRole: z.enum(['resident', 'owner', 'manager']),
    actorName: z.string(),
    fromStatus: complaintStatusSchema.nullable(),
    toStatus: complaintStatusSchema,
    note: z.string().nullable(),
    createdAt: instantSchema,
  })
  .strict();
export const complaintSchema = z
  .object({
    id,
    branchId: id,
    stayId: id,
    category: complaintCategorySchema,
    title: z.string(),
    description: z.string(),
    status: complaintStatusSchema,
    roomLabel: z.string().nullable(),
    bedLabel: z.string().nullable(),
    residentName: z.string(),
    assignedToName: z.string().nullable(),
    reopenCount: z.number().int().nonnegative(),
    attachmentFileIds: z.array(id).max(5),
    version: z.number().int().positive(),
    createdAt: instantSchema,
    resolvedAt: instantSchema.nullable(),
    closedAt: instantSchema.nullable(),
  })
  .strict();
export type Complaint = z.infer<typeof complaintSchema>;
export const complaintDetailSchema = complaintSchema
  .extend({ events: z.array(complaintEventSchema).max(200) })
  .strict();
export const complaintPageSchema = z
  .object({ data: z.array(complaintSchema).max(50), nextCursor: id.nullable() })
  .strict();
export const complaintQuerySchema = z
  .object({
    status: complaintStatusSchema.optional(),
    category: complaintCategorySchema.optional(),
    cursor: id.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export const complaintStaffActionSchema = z.discriminatedUnion('action', [
  z
    .object({ action: z.literal('assign'), expectedVersion: stayVersionSchema, assigneeUserId: id })
    .strict(),
  z.object({ action: z.literal('start'), expectedVersion: stayVersionSchema }).strict(),
  z
    .object({ action: z.literal('resolve'), expectedVersion: stayVersionSchema, note: text(2000) })
    .strict(),
  z
    .object({ action: z.literal('note'), expectedVersion: stayVersionSchema, note: text(2000) })
    .strict(),
]);
export const complaintResidentActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('accept'), expectedVersion: stayVersionSchema }).strict(),
  z
    .object({ action: z.literal('reopen'), expectedVersion: stayVersionSchema, note: text(2000) })
    .strict(),
]);
export const complaintStatsSchema = z
  .object({
    branchId: id,
    counts: z.record(complaintStatusSchema, z.number().int().nonnegative()),
    resolvedCount: z.number().int().nonnegative(),
    averageResolutionHours: z.number().nonnegative().nullable(),
  })
  .strict();
// REV-001..006: 1..5 ratings per approved category (v1 baseline schema).
export const reviewCategorySchema = z.enum([
  'cleanliness',
  'security',
  'food',
  'staff',
  'wifi',
  'facilities',
  'location',
  'value',
  'overall',
]);
const rating = z.number().int().min(1).max(5);
export const reviewRatingsSchema = z
  .object(
    Object.fromEntries(reviewCategorySchema.options.map((key) => [key, rating])) as Record<
      z.infer<typeof reviewCategorySchema>,
      typeof rating
    >,
  )
  .strict();
export type ReviewRatings = z.infer<typeof reviewRatingsSchema>;
export const reviewInputSchema = z
  .object({ ratings: reviewRatingsSchema, body: text(2000).optional() })
  .strict();
export const reviewEditInputSchema = reviewInputSchema
  .extend({ expectedVersion: stayVersionSchema })
  .strict();
export const reviewEligibilitySchema = z
  .object({
    stayId: id,
    eligible: z.boolean(),
    eligibleFrom: z.string().nullable(),
    reason: z.enum(['eligible', 'too_early', 'already_reviewed', 'not_checked_in']),
    reviewId: id.nullable(),
  })
  .strict();
const reply = z
  .object({ body: z.string(), createdAt: instantSchema, editedAt: instantSchema.nullable() })
  .strict();
// Public review: no room/bed, contact, CNIC or money; only the reviewer's first name.
export const publicReviewSchema = z
  .object({
    id,
    reviewerName: z.string(),
    verifiedStay: z.literal(true),
    ratings: reviewRatingsSchema,
    body: z.string().nullable(),
    createdAt: instantSchema,
    editedAt: instantSchema.nullable(),
    reply: reply.nullable(),
  })
  .strict();
export const publicReviewPageSchema = z
  .object({
    branchId: id,
    summary: z
      .object({
        count: z.number().int().nonnegative(),
        averages: z.record(reviewCategorySchema, z.number().min(1).max(5)).nullable(),
      })
      .strict(),
    data: z.array(publicReviewSchema).max(50),
    nextCursor: id.nullable(),
  })
  .strict();
export const ownReviewSchema = publicReviewSchema
  .omit({ verifiedStay: true })
  .extend({
    stayId: id,
    status: z.enum(['published', 'hidden', 'removed']),
    moderationReason: z.string().nullable(),
    version: z.number().int().positive(),
  })
  .strict();
export const staffReviewSchema = ownReviewSchema.omit({ stayId: true }).strict();
export const staffReviewPageSchema = z
  .object({ data: z.array(staffReviewSchema).max(50), nextCursor: id.nullable() })
  .strict();
export const reviewReplyInputSchema = z.object({ body: text(1000) }).strict();
export const reviewReportInputSchema = z
  .object({
    reason: z.enum(['harassment', 'spam', 'inappropriate_chat', 'scam', 'other']),
    details: text(1000).optional(),
  })
  .strict();
export const reviewModerationInputSchema = z
  .object({
    action: z.enum(['hide', 'remove', 'restore']),
    expectedVersion: stayVersionSchema,
    reason: text(500),
    reportId: id.optional(),
  })
  .strict();
// CMP-004: the only allowed moves. Resolved is not closed; only the resident's acceptance
// closes it, and a reopen keeps every earlier attempt in the history.
const complaintMoves: Record<
  'assign' | 'start' | 'resolve' | 'note' | 'accept' | 'reopen',
  { to: ComplaintStatus | 'same'; from: readonly ComplaintStatus[] }
> = {
  assign: { to: 'assigned', from: ['open', 'assigned', 'in_progress', 'reopened'] },
  start: { to: 'in_progress', from: ['open', 'assigned', 'reopened'] },
  resolve: { to: 'resolved', from: ['open', 'assigned', 'in_progress', 'reopened'] },
  note: { to: 'same', from: ['open', 'assigned', 'in_progress', 'resolved', 'reopened'] },
  accept: { to: 'closed', from: ['resolved'] },
  reopen: { to: 'reopened', from: ['resolved'] },
};
export function nextComplaintStatus(
  status: ComplaintStatus,
  action: keyof typeof complaintMoves,
): ComplaintStatus | null {
  const move = complaintMoves[action];
  if (!move.from.includes(status)) return null;
  return move.to === 'same' ? status : move.to;
}
export const REVIEW_MIN_STAY_DAYS = 30;
// REV-002: eligible once the verified Stay has lasted at least 30 calendar days (Karachi dates,
// check-in day to checkout day or today). Eligibility remains after checkout.
export function reviewEligibleFrom(checkedInOn: string) {
  return addRentDays(checkedInOn, BigInt(REVIEW_MIN_STAY_DAYS));
}
export function isReviewEligible(checkedInOn: string, lastDay: string) {
  return lastDay >= reviewEligibleFrom(checkedInOn);
}
