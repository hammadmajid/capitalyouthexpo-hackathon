import { z } from 'zod';
import { instantSchema } from './dates.js';
import { visitStatusSchema } from './visits.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export const visitHistoryActionSchema = z.enum([
  'request',
  'approve',
  'reschedule',
  'reject',
  'cancel',
  'accept-reschedule',
  'complete',
  'no-show',
]);
export const visitHistoryEntrySchema = z
  .object({
    id,
    action: visitHistoryActionSchema,
    status: visitStatusSchema,
    requestedStart: instantSchema,
    proposedStart: instantSchema.nullable(),
    reason: z.string().min(1).max(500).nullable(),
    createdAt: instantSchema,
  })
  .strict()
  .refine((entry) => (entry.status === 'rescheduled') === (entry.proposedStart !== null));
export const visitHistoryPageSchema = z
  .object({
    visitId: id,
    branchId: id,
    branchName: z.string().min(1).max(200),
    customerName: z.string().min(1).max(200),
    data: z.array(visitHistoryEntrySchema).max(100),
    nextCursor: id.nullable(),
  })
  .strict();
export type VisitHistoryPage = z.infer<typeof visitHistoryPageSchema>;
