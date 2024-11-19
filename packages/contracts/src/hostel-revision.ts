import { z } from 'zod';
import { instantSchema } from './dates.js';
import {
  hostelBasicsInputSchema,
  hostelOnboardingSchema,
  mainBranchDraftInputSchema,
} from './hostel-onboarding.js';
// CHG-041 / SRS v2.29: edits to an approved hostel's basics and location wait as one pending
// revision while the approved listing stays live. Each part holds the full proposed input.
const id = z.string().uuid();
export const hostelRevisionStatusSchema = z.enum([
  'draft',
  'submitted',
  'approved',
  'rejected',
  'cancelled',
]);
export const hostelRevisionChangesSchema = z
  .object({
    basics: hostelBasicsInputSchema.nullable(),
    main: mainBranchDraftInputSchema.nullable(),
  })
  .strict();
export const hostelRevisionSchema = z
  .object({
    id,
    brandId: id,
    branchId: id,
    status: hostelRevisionStatusSchema,
    changes: hostelRevisionChangesSchema,
    version: z.number().int().positive(),
    submittedAt: instantSchema.nullable(),
    decidedAt: instantSchema.nullable(),
    decisionNote: z.string().nullable(),
    updatedAt: instantSchema,
  })
  .strict();
// What the Owner sees: the live hostel plus the open (or latest decided) revision.
export const hostelRevisionStateSchema = z
  .object({ live: hostelOnboardingSchema, revision: hostelRevisionSchema.nullable() })
  .strict();
export const saveHostelRevisionSchema = z
  .object({
    expectedVersion: z.number().int().positive().nullable(),
    basics: hostelBasicsInputSchema.optional(),
    main: mainBranchDraftInputSchema.optional(),
  })
  .strict()
  .refine((value) => value.basics || value.main, 'Nothing to save');
export const hostelRevisionCommandSchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();
export const hostelRevisionDecisionSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    action: z.enum(['approve', 'reject']),
    reason: z.string().trim().min(1).max(1000).optional(),
  })
  .strict()
  .refine((value) => value.action === 'approve' || Boolean(value.reason), {
    message: 'A reason is required to reject',
    path: ['reason'],
  });
export const hostelRevisionQueueItemSchema = z
  .object({
    id,
    brandId: id,
    branchId: id,
    branchName: z.string(),
    organizationName: z.string(),
    submittedAt: instantSchema,
  })
  .strict();
export const hostelRevisionQueueSchema = z
  .object({ data: z.array(hostelRevisionQueueItemSchema).max(50), nextCursor: id.nullable() })
  .strict();
export const hostelRevisionQueueQuerySchema = z
  .object({
    cursor: id.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
// What the Admin reviews: the submitted revision beside the live values it would replace.
export const hostelRevisionReviewSchema = z
  .object({
    revision: hostelRevisionSchema,
    branchName: z.string(),
    organizationName: z.string(),
    live: hostelOnboardingSchema,
    // CHG-041: the Admin judges a location change by place names, never raw ids.
    placeNames: z.record(z.string().uuid(), z.string()).optional(),
  })
  .strict();
export type HostelRevision = z.infer<typeof hostelRevisionSchema>;
export type HostelRevisionChanges = z.infer<typeof hostelRevisionChangesSchema>;
export type HostelRevisionState = z.infer<typeof hostelRevisionStateSchema>;
export type SaveHostelRevision = z.infer<typeof saveHostelRevisionSchema>;
export type HostelRevisionDecision = z.infer<typeof hostelRevisionDecisionSchema>;
export type HostelRevisionQueue = z.infer<typeof hostelRevisionQueueSchema>;
export type HostelRevisionReview = z.infer<typeof hostelRevisionReviewSchema>;
