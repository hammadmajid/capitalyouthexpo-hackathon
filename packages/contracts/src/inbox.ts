import { z } from 'zod';
export const inboxItemSchema = z
  .object({
    id: z.string().uuid(),
    type: z.string().min(1).max(100),
    title: z.string().min(1).max(300),
    body: z.string().min(1).max(4000),
    readAt: z.string().datetime({ offset: true }).nullable(),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();
export const inboxPageSchema = z
  .object({
    data: z.array(inboxItemSchema).max(100),
    nextCursor: z.string().uuid().nullable(),
    unreadCount: z.number().int().nonnegative(),
  })
  .strict();
export const inboxReadSchema = z
  .object({ id: z.string().uuid(), readAt: z.string().datetime({ offset: true }) })
  .strict();
