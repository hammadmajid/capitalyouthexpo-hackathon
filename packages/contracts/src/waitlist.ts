import { z } from 'zod';
import { instantSchema, calendarDateSchema } from './dates.js';
import { managementPageSchema } from './management.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export const joinWaitlistSchema = z.object({ branchId: id, roomTypeId: id.optional() }).strict();
export const waitlistEntrySchema = z
  .object({
    id,
    branchId: id,
    branchName: z.string().min(1).max(200),
    roomTypeId: id.nullable(),
    roomTypeName: z.string().min(1).max(120).nullable(),
    expectedVacancyDate: calendarDateSchema.nullable(),
    joinedAt: instantSchema,
    leftAt: instantSchema.nullable(),
  })
  .strict()
  .refine((entry) => (entry.roomTypeId === null) === (entry.roomTypeName === null));
export const staffWaitlistEntrySchema = waitlistEntrySchema
  .innerType()
  .extend({ customerName: z.string().min(1).max(200) })
  .strict()
  .refine((entry) => (entry.roomTypeId === null) === (entry.roomTypeName === null));
export const waitlistQuerySchema = managementPageSchema
  .extend({ roomTypeId: id.optional() })
  .strict();
export const waitlistPageSchema = z
  .object({ data: z.array(waitlistEntrySchema).max(100), nextCursor: id.nullable() })
  .strict();
export const staffWaitlistPageSchema = z
  .object({ data: z.array(staffWaitlistEntrySchema).max(100), nextCursor: id.nullable() })
  .strict();
export const expectedVacancySchema = z
  .object({
    branchId: id,
    roomTypeId: id,
    expectedVacancyDate: calendarDateSchema.nullable(),
    version: instantSchema.nullable(),
  })
  .strict();
export const saveExpectedVacancySchema = z
  .object({
    expectedVersion: instantSchema.nullable(),
    expectedVacancyDate: calendarDateSchema.nullable(),
  })
  .strict();
export type WaitlistQuery = z.infer<typeof waitlistQuerySchema>;
export type WaitlistEntry = z.infer<typeof waitlistEntrySchema>;
export type JoinWaitlist = z.infer<typeof joinWaitlistSchema>;

export type SaveExpectedVacancy = z.infer<typeof saveExpectedVacancySchema>;
// CHG-040: public signal that a waiting list is open — room type ids only, no resident data.
export const publicWaitlistOpenSchema = z
  .object({ open: z.boolean(), roomTypeIds: z.array(z.string().uuid()).max(100) })
  .strict();
export type PublicWaitlistOpen = z.infer<typeof publicWaitlistOpenSchema>;
