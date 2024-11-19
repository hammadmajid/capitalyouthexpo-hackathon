import { z } from 'zod';
import { capabilitiesSchema } from './identity.js';
export const selfProfileSchema = z
  .object({
    user: z
      .object({
        id: z.string().uuid(),
        fullName: z.string(),
        email: z.string().email().nullable(),
        emailVerified: z.boolean(),
        cnicLast4: z.string().length(4).nullable(),
      })
      .strict(),
    capabilities: capabilitiesSchema,
    features: z.object({ profileReviews: z.boolean() }).strict().optional(),
  })
  .strict();
export type SelfProfile = z.infer<typeof selfProfileSchema>;

// Response-shape negotiation only; this header grants no authority.
export const PROFILE_REVIEWS_HEADER = 'x-hsm-profile-reviews';
