import { z } from 'zod';
import { instantSchema } from './dates.js';
const identifier = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const visitingWindowSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    opensAt: clock,
    closesAt: clock,
  })
  .strict()
  .refine((value) => value.opensAt < value.closesAt, 'Visiting window must be ordered');
export const visitingScheduleSchema = z
  .array(visitingWindowSchema)
  .max(100)
  .superRefine((windows, context) => {
    const ordered = [...windows].sort(
      (a, b) => a.dayOfWeek - b.dayOfWeek || a.opensAt.localeCompare(b.opensAt),
    );
    let previous: z.infer<typeof visitingWindowSchema> | undefined;
    for (const current of ordered) {
      if (
        previous &&
        previous.dayOfWeek === current.dayOfWeek &&
        current.opensAt < previous.closesAt
      )
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'Visiting windows overlap' });
      previous = current;
    }
  });
export const createVisitInputSchema = z
  .object({ branchId: identifier, requestedStart: instantSchema })
  .strict();
export const visitStatusSchema = z.enum([
  'requested',
  'approved',
  'rescheduled',
  'rejected',
  'cancelled',
  'completed',
  'no_show',
]);
const reason = z.string().trim().min(1).max(500);
export const visitCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve') }).strict(),
  z
    .object({
      action: z.literal('reschedule'),
      proposedStart: instantSchema,
      note: reason.optional(),
    })
    .strict(),
  z.object({ action: z.literal('reject'), reason }).strict(),
  z.object({ action: z.literal('cancel') }).strict(),
  z.object({ action: z.literal('accept-reschedule') }).strict(),
  z.object({ action: z.literal('complete') }).strict(),
  z.object({ action: z.literal('no-show') }).strict(),
]);
export const visitTimingSchema = z
  .object({
    status: visitStatusSchema,
    requestedStart: instantSchema,
    proposedStart: instantSchema.nullable(),
  })
  .strict()
  .refine(
    (value) => (value.status === 'rescheduled') === (value.proposedStart !== null),
    'Only a pending reschedule has a proposed time',
  );
export type VisitingWindow = z.infer<typeof visitingWindowSchema>;
export type VisitTiming = z.infer<typeof visitTimingSchema>;
export type VisitCommand = z.infer<typeof visitCommandSchema>;
