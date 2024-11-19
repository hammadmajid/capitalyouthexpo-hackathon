import { z } from 'zod';
import {
  supportMessageSchema,
  supportPrioritySchema,
  supportQuerySchema,
} from './platform-admin.js';
import { stayIdentifierSchema } from './stay-values.js';

// ADM-009: staff search is literal text; participant list scope is not widened.
export const supportStaffQuerySchema = supportQuerySchema
  .extend({
    priority: supportPrioritySchema.optional(),
    q: z.string().trim().min(1).max(160).optional(),
  })
  .strict();
export const supportMessageQuerySchema = z
  .object({
    cursor: stayIdentifierSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
export const supportMessagePageSchema = z
  .object({
    ticketId: stayIdentifierSchema,
    data: z.array(supportMessageSchema).max(100),
    nextCursor: stayIdentifierSchema.nullable(),
  })
  .strict();
