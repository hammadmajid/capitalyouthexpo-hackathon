import { z } from 'zod';
import { stayIdentifierSchema as id } from './stay-values.js';
import { instantSchema } from './dates.js';
export const customerGovernanceQuerySchema = z
  .object({
    cursor: id.optional(),
    userId: id.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    status: z.enum(['active', 'suspended', 'banned']).default('active'),
  })
  .strict();
export const customerGovernanceRecordSchema = z
  .object({
    userId: id,
    fullName: z.string(),
    status: z.enum(['active', 'suspended', 'banned']),
    updatedAt: instantSchema,
  })
  .strict();
export const customerGovernancePageSchema = z
  .object({ data: z.array(customerGovernanceRecordSchema).max(50), nextCursor: id.nullable() })
  .strict();
export const customerGovernanceInputSchema = z
  .object({
    action: z.enum(['warn', 'suspend', 'ban', 'reinstate']),
    reason: z.string().trim().min(8).max(500),
    expectedStatus: z.enum(['active', 'suspended', 'banned']),
    expectedUpdatedAt: instantSchema,
  })
  .strict();
