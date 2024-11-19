import { z } from 'zod';
import { pakistaniMobileSchema } from './phone.js';
// AUTH-C CHG-006: self-only edit projection; no credentials, plaintext CNIC or signed URLs.
export const profileDetailsSchema = z
  .object({
    userId: z.string().uuid(),
    fullName: z.string().max(150),
    email: z.string().email().nullable(),
    emailVerified: z.boolean(),
    phone: pakistaniMobileSchema.nullable(),
    gender: z.enum(['male', 'female']).nullable(),
    cnicLast4: z
      .string()
      .regex(/^\d{4}$/)
      .nullable(),
    profilePhotoFileId: z.string().uuid().nullable(),
    customer: z
      .object({
        age: z.number().int().min(18).max(120).nullable(),
        institution: z.string().max(200).nullable(),
        completed: z.boolean(),
      })
      .strict()
      .nullable(),
    owner: z
      .object({
        address: z.string().max(500),
        organizationName: z.string().max(150).nullable().optional(),
        cnicFrontFileId: z.string().uuid().nullable(),
        cnicBackFileId: z.string().uuid().nullable(),
        agreementVersion: z.string().min(1).max(100),
        agreementAcceptedAt: z.string().datetime(),
        completed: z.boolean(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type ProfileDetails = z.infer<typeof profileDetailsSchema>;
