import { z } from 'zod';
import { emailRequestSchema } from './auth.js';
import { passwordSchema, verifyEmailSchema } from './identity.js';
export const emailAssociationRequestSchema = emailRequestSchema
  .extend({ currentPassword: passwordSchema })
  .strict();
export const emailAssociationVerificationSchema = emailRequestSchema
  .extend({ code: verifyEmailSchema.shape.code })
  .strict();
export type EmailAssociationRequest = z.infer<typeof emailAssociationRequestSchema>;
export type EmailAssociationVerification = z.infer<typeof emailAssociationVerificationSchema>;
