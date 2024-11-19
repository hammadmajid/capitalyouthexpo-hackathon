import { z } from 'zod';
import { instantSchema } from './dates.js';
import { billingPolicySchema } from './billing-policy.js';
import { stayIdentifierSchema } from './stay-values.js';

export const billingSettingsTargetSchema = z
  .object({
    branchId: stayIdentifierSchema,
    roomTypeId: stayIdentifierSchema.optional(),
  })
  .strict();
export type BillingSettingsTarget = z.infer<typeof billingSettingsTargetSchema>;
export const billingSettingsInputSchema = z.object({ policy: billingPolicySchema }).strict();
export const billingPolicyVersionSchema = z
  .object({
    id: stayIdentifierSchema,
    level: z.enum(['platform', 'hostel', 'branch', 'room_type']),
    scopeId: stayIdentifierSchema.nullable(),
    policy: billingPolicySchema,
    createdAt: instantSchema,
  })
  .strict()
  .refine(
    (value) => (value.level === 'platform') === (value.scopeId === null),
    'Only a platform policy has no scope identifier',
  );
export const billingSettingsReadSchema = z
  .object({
    target: billingSettingsTargetSchema,
    canEdit: z.boolean(),
    canEditTransport: z.boolean().optional(),
    localVersion: billingPolicyVersionSchema.nullable(),
    effectiveVersion: billingPolicyVersionSchema.nullable(),
  })
  .strict();
