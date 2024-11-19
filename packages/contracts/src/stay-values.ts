import { z } from 'zod';
import { calendarDateSchema } from './dates.js';
import { databaseDateSchema } from './database-dates.js';
import { cnicSchema, phoneSchema } from './identity.js';
export const stayStateSchema = z.enum([
  'check_in_ready',
  'active',
  'notice_given',
  'checkout_pending',
  'completed',
  'cancelled_before_checkin',
  'terminated',
  'abandoned',
]);
export type StayState = z.infer<typeof stayStateSchema>;
export const staySourceSchema = z.enum(['booking', 'manual']);
export const stayIdentifierSchema = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export const stayVersionSchema = z.number().int().positive().max(2_147_483_647);
// SEC-003: accept Unicode names, including paired emoji, but reject invalid PostgreSQL text.
export function stayPrivateText(maximum: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .refine(
      (value) => !value.includes(String.fromCharCode(0)) && !/[\uD800-\uDFFF]/u.test(value),
      'Invalid text',
    );
}
export const residentProfileInputSchema = z
  .object({
    displayName: stayPrivateText(120),
    phone: phoneSchema.optional(),
    email: z
      .string()
      .trim()
      .email()
      .transform((value) => value.toLowerCase())
      .optional(),
    // CHG-054: private CNIC; the API encrypts it before storing and only ever shows the last 4.
    cnic: cnicSchema.optional(),
  })
  .strict();
// RES-001/003: this is a branch-local relationship, never a new login identity.
export const residentReferenceInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('existing'), residentId: stayIdentifierSchema }).strict(),
  z.object({ kind: z.literal('new'), profile: residentProfileInputSchema }).strict(),
]);
export const stayPeriodSchema = z
  .object({
    moveInDate: calendarDateSchema,
    expectedLeaveDate: calendarDateSchema.nullable(),
  })
  .strict()
  .refine(
    (value) => value.expectedLeaveDate === null || value.moveInDate < value.expectedLeaveDate,
    'Expected departure must follow move-in',
  );

// Preserve the pure planner period while adapting actual persisted Stay commands.
export const databaseStayPeriodSchema = stayPeriodSchema.pipe(
  z
    .object({ moveInDate: databaseDateSchema, expectedLeaveDate: databaseDateSchema.nullable() })
    .strict(),
);
