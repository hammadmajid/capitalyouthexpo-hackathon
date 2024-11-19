import { z } from 'zod';
import { calendarDateSchema } from './dates.js';
export const accountStatusSchema = z.enum([
  'unclaimed',
  'active',
  'suspended',
  'banned',
  'deactivated',
]);
export const managerStatusSchema = z.enum([
  'pending_activation',
  'active',
  'suspended',
  'deactivated',
]);
export const adminRoleSchema = z.enum(['verification', 'support', 'content_moderator', 'billing']);
export const clientSchema = z.enum(['mobile', 'web']);
export const phoneSchema = z.string().regex(/^\+92[0-9]{10}$/);
export const permanentAddressSchema = z.string().trim().min(5).max(500);
export const passwordSchema = z.string().min(8).max(128);
export const cnicSchema = z
  .string()
  .regex(/^(?:\d{13}|\d{5}-\d{7}-\d)$/)
  .transform((value) => value.replaceAll('-', ''));
export const registrationSchema = z
  .object({
    fullName: z.string().trim().min(2).max(150),
    email: z
      .string()
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
    phone: phoneSchema,
    password: passwordSchema,
    gender: z.enum(['male', 'female']),
    dateOfBirth: calendarDateSchema,
    cnic: cnicSchema,
  })
  .strict();
export const loginSchema = z
  .object({
    identifier: z.string().min(3).max(254),
    password: passwordSchema,
    client: clientSchema,
  })
  .strict();
export const verifyEmailSchema = z
  .object({
    email: z.string().email(),
    code: z.string().regex(/^\d{6}$/),
  })
  .strict();
export const paginationSchema = z
  .object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export const capabilitiesSchema = z
  .object({
    customer: z.boolean(),
    owner: z.boolean(),
    managerOf: z.array(z.object({ branchId: z.string().uuid(), branchName: z.string() }).strict()),
    admin: z
      .object({ isRoot: z.boolean(), roles: z.array(adminRoleSchema) })
      .strict()
      .nullable(),
  })
  .strict();
