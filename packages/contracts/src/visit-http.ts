import { z } from 'zod';
import { calendarDateSchema, instantSchema } from './dates.js';
import { managementPageSchema } from './management.js';
import { visitCommandSchema, visitStatusSchema, visitingScheduleSchema } from './visits.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export const visitingHoursVersionSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const visitingHoursStateSchema = z
  .object({ branchId: id, version: visitingHoursVersionSchema, windows: visitingScheduleSchema })
  .strict();
export const saveVisitingHoursSchema = z
  .object({ expectedVersion: visitingHoursVersionSchema, windows: visitingScheduleSchema })
  .strict();
export const visitSummarySchema = z
  .object({
    id,
    branchId: id,
    status: visitStatusSchema,
    requestedStart: instantSchema,
    proposedStart: instantSchema.nullable(),
    reason: z.string().min(1).max(500).nullable(),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .refine((value) => (value.status === 'rescheduled') === (value.proposedStart !== null));
export const visitActionInputSchema = z
  .object({ expectedUpdatedAt: instantSchema, command: visitCommandSchema })
  .strict();
export const visitListQuerySchema = managementPageSchema
  .extend({ date: calendarDateSchema.optional(), status: visitStatusSchema.optional() })
  .strict();
export const visitListEntrySchema = visitSummarySchema
  .innerType()
  .extend({
    branchName: z.string().min(1).max(200),
    customerName: z.string().min(1).max(200),
  })
  .strict()
  .refine((value) => (value.status === 'rescheduled') === (value.proposedStart !== null));
export type VisitListEntry = z.infer<typeof visitListEntrySchema>;
export const visitPageSchema = z
  .object({ data: z.array(visitListEntrySchema).max(100), nextCursor: id.nullable() })
  .strict();
export type VisitListQuery = z.infer<typeof visitListQuerySchema>;
export type VisitSummary = z.infer<typeof visitSummarySchema>;
export type SaveVisitingHours = z.infer<typeof saveVisitingHoursSchema>;
export type VisitActionInput = z.infer<typeof visitActionInputSchema>;

export const visitSlotsSchema = z
  .object({ branchId: id, date: calendarDateSchema, windows: visitingScheduleSchema })
  .strict();
