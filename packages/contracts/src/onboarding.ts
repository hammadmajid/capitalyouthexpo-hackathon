import { z } from 'zod';
import { cnicSchema, clientSchema, passwordSchema } from './identity.js';
import { emailRequestSchema } from './auth.js';
import { pakistaniMobileSchema } from './phone.js';
export const registrationStartSchema = emailRequestSchema;
export const registrationVerifySchema = registrationStartSchema
  .extend({
    code: z.string().regex(/^\d{6}$/),
  })
  .strict();
export const registrationPasswordSchema = z
  .object({
    setupToken: z.string().min(32).max(512),
    password: passwordSchema,
    client: clientSchema,
  })
  .strict();
// CHG-006: verification authorizes password setup only, never protected API access.
export const registrationVerificationResultSchema = z.discriminatedUnion('next', [
  z
    .object({
      next: z.literal('password'),
      setupToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
      expiresIn: z.literal(600),
    })
    .strict(),
  z.object({ next: z.literal('login') }).strict(),
]);
export const initialExperienceSchema = z
  .object({ experience: z.enum(['customer', 'owner']) })
  .strict();
const name = z.string().trim().min(2).max(150);
// Missing keeps the current avatar; explicit null unlinks it without deleting the file.
const photo = z.string().uuid().nullable().optional();
export const customerProfileInputSchema = z
  .object({
    fullName: name,
    phone: pakistaniMobileSchema,
    age: z.number().int().min(18).max(120),
    gender: z.enum(['male', 'female']),
    institution: z.string().trim().min(2).max(200).optional(),
    profilePhotoFileId: photo,
  })
  .strict();
// Verified email is resolved from the authenticated identity, never supplied as proof.
export const ownerProfileInputSchema = z
  .object({
    fullName: name,
    phone: pakistaniMobileSchema,
    cnic: cnicSchema,
    cnicFrontFileId: z.string().uuid().optional(),
    cnicBackFileId: z.string().uuid().optional(),
    address: z.string().trim().min(5).max(500),
    agreementAccepted: z.literal(true),
    agreementVersion: z.literal('owner-foundation-v1'),
    organizationName: z.string().trim().min(2).max(150).optional(),
    profilePhotoFileId: photo,
  })
  .strict()
  .refine(
    (value) =>
      !value.cnicFrontFileId ||
      !value.cnicBackFileId ||
      value.cnicFrontFileId !== value.cnicBackFileId,
    {
      message: 'Separate document sides are required',
      path: ['cnicBackFileId'],
    },
  );
export const managerInvitationInputSchema = z
  .object({
    fullName: name,
    phone: pakistaniMobileSchema,
    temporaryCredential: z.discriminatedUnion('mode', [
      z.object({ mode: z.literal('auto') }).strict(),
      z.object({ mode: z.literal('manual'), password: passwordSchema }).strict(),
    ]),
  })
  .strict();
