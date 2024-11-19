import { z } from 'zod';
import {
  bookingPolicySchema,
  bookingPolicyOverrideSchema,
  bookingPlatformLimitsSchema,
} from './booking-policy.js';
export const platformBookingSettingsSchema = z
  .object({
    policy: bookingPolicySchema,
    limits: bookingPlatformLimitsSchema,
    expectedCurrentVersionId: z.string().uuid().nullable().optional(),
  })
  .strict();
export const bookingOverrideInputSchema = z
  .object({ overrides: bookingPolicyOverrideSchema })
  .strict();
export const bookingPolicyVersionSchema = z
  .object({
    id: z.string().uuid(),
    level: z.enum(['platform', 'hostel', 'branch', 'room_type']),
    scopeId: z.string().uuid().nullable(),
  })
  .strict();
export const bookingPolicyVersionsSchema = z
  .object({ versions: z.array(bookingPolicyVersionSchema) })
  .strict();

const policyReadTargetSchema = bookingPolicyVersionSchema.omit({ id: true });
export const bookingPolicyReadSchema = z.discriminatedUnion('configured', [
  z
    .object({ configured: z.literal(false), target: policyReadTargetSchema, canEdit: z.boolean() })
    .strict(),
  z
    .object({
      configured: z.literal(true),
      target: policyReadTargetSchema,
      canEdit: z.boolean(),
      localVersion: bookingPolicyVersionSchema.nullable(),
      overrides: bookingPolicyOverrideSchema.nullable(),
      inherited: bookingPolicySchema.nullable(),
      effective: bookingPolicySchema,
      limits: bookingPlatformLimitsSchema,
      lineage: z.array(bookingPolicyVersionSchema).min(1).max(4),
    })
    .strict(),
]);
