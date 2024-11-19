import { z } from 'zod';
import { stayIdentifierSchema as id } from './stay-values.js';
import { instantSchema } from './dates.js';
export const agreementDigestSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const agreementAcceptanceInputSchema = z
  .object({
    version: z.number().int().positive(),
    termsDigest: agreementDigestSchema,
    acknowledged: z.literal(true),
  })
  .strict();
export const agreementAcceptanceSchema = z
  .object({
    id,
    branchId: id,
    stayId: id,
    agreementId: id,
    agreementVersion: z.number().int().positive(),
    acceptedByUserId: id,
    acceptedAt: instantSchema,
    termsDigest: agreementDigestSchema,
    method: z.literal('authenticated_acknowledgement'),
  })
  .strict();
export type AgreementAcceptanceInput = z.infer<typeof agreementAcceptanceInputSchema>;
