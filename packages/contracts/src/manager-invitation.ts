import { z } from 'zod';
import { passwordSchema } from './identity.js';

import { managerInvitationInputSchema } from './onboarding.js';
export const managerCredentialInputSchema = z
  .object({
    temporaryCredential: managerInvitationInputSchema.shape.temporaryCredential,
  })
  .strict();
export const managerInvitationStateSchema = z
  .object({
    id: z.string().uuid(),
    branchId: z.string().uuid(),
    status: z.literal('pending_activation'),
    expiresAt: z.string().datetime(),
    acceptance: z.enum(['temporary_password', 'authenticated_account']),
  })
  .strict();
export const managerInvitationResponseSchema = managerInvitationStateSchema
  .extend({
    generatedTempPassword: passwordSchema.optional(),
  })
  .strict();
export type ManagerCredentialInput = z.infer<typeof managerCredentialInputSchema>;
export type ManagerInvitationInput = z.infer<typeof managerInvitationInputSchema>;
export type ManagerInvitationState = z.infer<typeof managerInvitationStateSchema>;
