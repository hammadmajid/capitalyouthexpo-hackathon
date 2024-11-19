import { z } from 'zod';
import { instantSchema } from './dates.js';
import { databaseDateSchema } from './database-dates.js';
import { phoneSchema } from './identity.js';
import {
  stayIdentifierSchema as id,
  stayPrivateText,
  staySourceSchema,
  stayStateSchema,
} from './stay-values.js';
// RES-004: current = holds a Stay that still occupies (active, notice given or checkout
// pending); former = only closed or cancelled Stays; none = no Stay yet.
export const CURRENT_STAY_STATES = ['active', 'notice_given', 'checkout_pending'] as const;
export const residentStatusSchema = z.enum(['current', 'former', 'none']);
export const residentDirectoryQuerySchema = z
  .object({
    q: stayPrivateText(100).optional(),
    status: residentStatusSchema.optional(),
    billing: z.enum(['due', 'overdue']).optional(),
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .optional(),
    linked: z.enum(['true', 'false']).optional(),
    sort: z.enum(['name', 'newest']).default('name'),
    cursor: id.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export type ResidentDirectoryQuery = z.infer<typeof residentDirectoryQuerySchema>;
export const residentCurrentStaySchema = z
  .object({
    id,
    state: stayStateSchema,
    moveInDate: databaseDateSchema,
    roomLabel: z.string().nullable(),
    bedLabel: z.string().nullable(),
  })
  .strict();
// One row per branch resident relationship, never one per Stay.
export const residentDirectoryRowSchema = z
  .object({
    id,
    displayName: z.string(),
    linked: z.boolean(),
    status: residentStatusSchema,
    currentStay: residentCurrentStaySchema.nullable(),
  })
  .strict()
  .refine((row) => (row.status === 'current') === (row.currentStay !== null), 'Invalid status');
export const residentDirectoryPageSchema = z
  .object({ data: z.array(residentDirectoryRowSchema).max(50), nextCursor: id.nullable() })
  .strict();
export type ResidentDirectoryPage = z.infer<typeof residentDirectoryPageSchema>;
export const RESIDENT_PROFILE_STAY_LIMIT = 50;
// RES-004 / CHG-009: staff-only profile. Account linkage is a fact recorded at admission;
// contact details never establish or imply it. No identity documents are included; the CNIC
// is shown masked, as its last 4 digits only (CHG-054 / CHG-004).
export const residentProfileSchema = z
  .object({
    id,
    branchId: id,
    displayName: z.string(),
    contact: z
      .object({ phone: phoneSchema.nullable(), email: z.string().email().max(254).nullable() })
      .strict(),
    cnicLast4: z
      .string()
      .regex(/^\d{4}$/)
      .nullable(),
    linked: z.boolean(),
    archived: z.boolean(),
    createdAt: instantSchema,
    status: residentStatusSchema,
    currentStay: residentCurrentStaySchema.nullable(),
    stays: z
      .array(
        z
          .object({
            id,
            source: staySourceSchema,
            state: stayStateSchema,
            moveInDate: databaseDateSchema,
            expectedLeaveDate: databaseDateSchema.nullable(),
            closedAt: instantSchema.nullable(),
          })
          .strict(),
      )
      .max(RESIDENT_PROFILE_STAY_LIMIT),
    staysTruncated: z.boolean(),
  })
  .strict();
export type ResidentProfile = z.infer<typeof residentProfileSchema>;
// RES-006: staff correct an offline resident's name and contact details. A linked resident
// manages their own account details, so staff edits are refused for them (CHG-009).
export const residentContactUpdateSchema = z
  .object({
    displayName: stayPrivateText(120),
    phone: phoneSchema.nullable(),
    email: z.string().trim().toLowerCase().email().min(3).max(254).nullable(),
  })
  .strict();
export type ResidentContactUpdate = z.infer<typeof residentContactUpdateSchema>;
