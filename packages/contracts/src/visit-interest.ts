import { z } from 'zod';
import { instantSchema } from './dates.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export const visitInterestInputSchema = z
  .object({ expectedUpdatedAt: instantSchema, stillInterested: z.boolean() })
  .strict();
export const visitInterestStateSchema = z
  .object({
    visitId: id,
    branchId: id,
    expectedUpdatedAt: instantSchema,
    promptedAt: instantSchema.nullable(),
    stillInterested: z.boolean().nullable(),
    respondedAt: instantSchema.nullable(),
  })
  .strict()
  .refine((value) => (value.stillInterested === null) === (value.respondedAt === null));
export type VisitInterestInput = z.infer<typeof visitInterestInputSchema>;
