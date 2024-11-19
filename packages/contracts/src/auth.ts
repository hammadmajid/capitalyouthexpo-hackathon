import { z } from 'zod';
import { clientSchema, passwordSchema, phoneSchema, verifyEmailSchema } from './identity.js';
export const emailRequestSchema = z
  .object({
    email: z
      .string()
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
  })
  .strict();
export const emailVerificationSessionSchema = verifyEmailSchema
  .extend({
    email: emailRequestSchema.shape.email,
    client: clientSchema.default('mobile'),
  })
  .strict();
export const passwordResetSchema = verifyEmailSchema
  .extend({
    email: emailRequestSchema.shape.email,
    newPassword: passwordSchema,
  })
  .strict();
export const refreshRequestSchema = z
  .object({
    refreshToken: z.string().min(32).max(512).optional(),
  })
  .strict();

export const passwordChangeSchema = z
  .object({
    currentPassword: passwordSchema,
    newPassword: passwordSchema,
  })
  .strict();

export const managerActivationSchema = z
  .object({
    phone: phoneSchema,
    tempPassword: passwordSchema,
    newPassword: passwordSchema,
    client: clientSchema.default('mobile'),
  })
  .strict();
