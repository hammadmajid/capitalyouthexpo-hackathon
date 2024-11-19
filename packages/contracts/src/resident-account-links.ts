import { z } from 'zod';

export const residentAccountLinkDecisionSchema = z
  .object({ action: z.enum(['approve', 'reject']) })
  .strict();
export const residentAccountLinkPageSchema = z
  .object({
    data: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            residentId: z.string().uuid(),
            residentName: z.string(),
            customerName: z.string(),
            phone: z.string(),
            createdAt: z.string().datetime(),
          })
          .strict(),
      )
      .max(50),
    nextCursor: z.string().uuid().nullable(),
  })
  .strict();
export type ResidentAccountLinkPage = z.infer<typeof residentAccountLinkPageSchema>;
