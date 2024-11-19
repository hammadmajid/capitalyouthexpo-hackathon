import { z } from 'zod';
import { instantSchema } from './dates.js';
import {
  stayIdentifierSchema as id,
  stayPrivateText as text,
  stayVersionSchema,
} from './stay-values.js';
// ADM-001..006: Root and Normal Admin hierarchy. Billing stays unused (CHG-003).
export const platformAdminRoleSchema = z.enum(['verification', 'support', 'content_moderator']);
export const adminStatusSchema = z.enum(['invited', 'active', 'suspended', 'deactivated']);
export const adminAccountSchema = z
  .object({
    userId: id,
    fullName: z.string(),
    isRoot: z.boolean(),
    status: adminStatusSchema,
    roles: z.array(platformAdminRoleSchema).max(3),
  })
  .strict();
export type AdminAccount = z.infer<typeof adminAccountSchema>;
export const adminListQuerySchema = z
  .object({
    cursor: id.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
export const adminAccountListSchema = z
  .object({
    data: z.array(adminAccountSchema).max(100),
    nextCursor: id.nullable().default(null),
    activeRootCount: z.number().int().min(0).max(3).optional(),
    totalCount: z.number().int().nonnegative().optional(),
  })
  .strict();
export const adminInviteInputSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    roles: z.array(platformAdminRoleSchema).min(1).max(3),
  })
  .strict();
export const adminChangeInputSchema = z.discriminatedUnion('change', [
  z
    .object({
      change: z.literal('roles'),
      roles: z.array(platformAdminRoleSchema).min(1).max(3),
      reason: text(500),
    })
    .strict(),
  z
    .object({
      change: z.literal('status'),
      status: z.enum(['active', 'suspended', 'deactivated']),
      reason: text(500),
    })
    .strict(),
  z.object({ change: z.literal('root'), isRoot: z.boolean(), reason: text(500) }).strict(),
]);
// ADM-007: hostel verification decisions.
export const verificationActionSchema = z.enum([
  'start_review',
  'request_changes',
  'approve',
  'reject',
  'suspend',
  'reinstate',
]);
export const verificationStatusSchema = z.enum([
  'draft',
  'submitted',
  'under_review',
  'changes_requested',
  'approved',
  'rejected',
  'suspended',
]);
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;
const verificationMoves: Record<
  z.infer<typeof verificationActionSchema>,
  { from: VerificationStatus[]; to: VerificationStatus; reason: boolean }
> = {
  start_review: { from: ['submitted'], to: 'under_review', reason: false },
  request_changes: { from: ['submitted', 'under_review'], to: 'changes_requested', reason: true },
  approve: { from: ['submitted', 'under_review'], to: 'approved', reason: false },
  reject: { from: ['submitted', 'under_review'], to: 'rejected', reason: true },
  suspend: { from: ['approved'], to: 'suspended', reason: true },
  reinstate: { from: ['suspended'], to: 'approved', reason: true },
};
export function nextVerificationStatus(
  status: VerificationStatus,
  action: z.infer<typeof verificationActionSchema>,
) {
  const move = verificationMoves[action];
  return move.from.includes(status) ? { to: move.to, reasonRequired: move.reason } : null;
}
export const verificationDecisionInputSchema = z
  .object({ action: verificationActionSchema, reason: text(1000).optional() })
  .strict();
export const verificationQueueItemSchema = z
  .object({
    branchId: id,
    branchName: z.string(),
    organizationName: z.string(),
    status: verificationStatusSchema,
    updatedAt: instantSchema,
  })
  .strict();
export const verificationQueueSchema = z
  .object({ data: z.array(verificationQueueItemSchema).max(50), nextCursor: id.nullable() })
  .strict();
export const verificationQueueQuerySchema = z
  .object({
    status: verificationStatusSchema.default('submitted'),
    cursor: id.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
// ADM-008 / REV-006: review report queue and policy actions (never for negativity alone).
export const reviewReportItemSchema = z
  .object({
    reportId: id,
    reviewId: id,
    branchId: id,
    reason: z.string(),
    details: z.string().nullable(),
    status: z.enum(['open', 'investigating', 'actioned', 'dismissed']),
    reviewStatus: z.enum(['published', 'hidden', 'removed']),
    reviewBody: z.string().nullable(),
    reviewVersion: z.number().int().positive(),
    createdAt: instantSchema,
  })
  .strict();
export const reviewReportQueueSchema = z
  .object({ data: z.array(reviewReportItemSchema).max(50), nextCursor: id.nullable() })
  .strict();
export const reportDismissInputSchema = z.object({ reason: text(500) }).strict();
// ADM-009: support tickets.
export const supportCategorySchema = z.enum([
  'account',
  'listing',
  'booking',
  'payment',
  'technical',
  'other',
]);
export const supportPrioritySchema = z.enum(['normal', 'high', 'critical']);
export const supportStatusSchema = z.enum([
  'open',
  'in_progress',
  'waiting_for_user',
  'resolved',
  'closed',
]);
export const supportTicketInputSchema = z
  .object({ subject: text(160), category: supportCategorySchema, body: text(4000) })
  .strict();
export const supportMessageSchema = z
  .object({
    id,
    authorName: z.string(),
    fromSupport: z.boolean(),
    internal: z.boolean(),
    body: z.string(),
    createdAt: instantSchema,
  })
  .strict();
export const supportTicketSchema = z
  .object({
    id,
    subject: z.string(),
    category: supportCategorySchema,
    priority: supportPrioritySchema,
    status: supportStatusSchema,
    openedByName: z.string(),
    assignedToName: z.string().nullable(),
    version: z.number().int().positive(),
    createdAt: instantSchema,
    updatedAt: instantSchema,
    messages: z.array(supportMessageSchema).max(200),
  })
  .strict();
export const supportTicketPageSchema = z
  .object({
    data: z.array(supportTicketSchema.omit({ messages: true })).max(50),
    nextCursor: id.nullable(),
  })
  .strict();
export const supportQuerySchema = z
  .object({
    status: supportStatusSchema.optional(),
    cursor: id.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export const supportReplyInputSchema = z.object({ body: text(4000) }).strict();
export const supportStaffInputSchema = z
  .object({
    expectedVersion: stayVersionSchema,
    status: supportStatusSchema.optional(),
    priority: supportPrioritySchema.optional(),
    assignToMe: z.boolean().optional(),
    body: text(4000).optional(),
    internal: z.boolean().default(false),
  })
  .strict()
  .refine(
    (value) => value.status || value.priority || value.assignToMe || value.body,
    'Nothing to change',
  );
// ADM-010: plain-text announcements to an approved audience (no HTML; in-app delivery only).
export const announcementInputSchema = z
  .object({
    audience: z.enum(['all_managers', 'selected_branches', 'customers', 'city']),
    branchIds: z.array(id).max(200).default([]),
    cityId: id.optional(),
    title: text(120),
    body: text(2000),
    scheduledAt: instantSchema.optional(),
  })
  .strict()
  .refine(
    (value) => (value.audience === 'selected_branches') === value.branchIds.length > 0,
    'Choose branches only for a selected-branches audience',
  )
  .refine(
    (value) => (value.audience === 'city') === (value.cityId !== undefined),
    'Choose a city only for a city audience',
  );
export const announcementSchema = z
  .object({
    id,
    audience: z.enum(['all_managers', 'selected_branches', 'customers', 'city']),
    title: z.string(),
    body: z.string(),
    status: z.enum(['scheduled', 'sent', 'cancelled']),
    scheduledAt: instantSchema,
    sentAt: instantSchema.nullable(),
    recipientCount: z.number().int().nonnegative().nullable(),
    version: z.number().int().positive(),
  })
  .strict();
export const announcementListSchema = z
  .object({ data: z.array(announcementSchema).max(50) })
  .strict();
