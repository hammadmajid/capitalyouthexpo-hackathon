import { z } from 'zod';
import { managementPageSchema } from './management.js';
import { instantSchema } from './dates.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export const createConversationSchema = z.object({ branchId: id }).strict();
export const chatMessageInputSchema = z
  .object({
    body: z.string().trim().min(1).max(4000).optional(),
    attachmentFileIds: z
      .array(id)
      .min(1)
      .max(5)
      .refine((values) => new Set(values).size === values.length)
      .optional(),
  })
  .strict()
  .refine(
    (value) => Boolean(value.body) || Boolean(value.attachmentFileIds?.length),
    'A message requires text or attachments',
  );
export const conversationSchema = z
  .object({
    id,
    branchId: id,
    branchName: z.string().min(1).max(200),
    customerUserId: id,
    customerName: z.string().min(1).max(200),
    lastMessageAt: instantSchema.nullable(),
    createdAt: instantSchema,
    lastReadAt: instantSchema.nullable(),
    unreadCount: z.number().int().nonnegative(),
  })
  .strict();
export const conversationPageSchema = z
  .object({ data: z.array(conversationSchema).max(100), nextCursor: id.nullable() })
  .strict();
export const chatMessageSchema = z
  .object({
    id,
    conversationId: id,
    senderUserId: id,
    senderName: z.string().min(1).max(200),
    senderSide: z.enum(['customer', 'branch']),
    body: z.string().min(1).max(4000).nullable(),
    attachmentFileIds: z.array(id).max(5),
    createdAt: instantSchema,
  })
  .strict()
  .refine((value) => value.body !== null || value.attachmentFileIds.length > 0);
export const chatMessagePageSchema = z
  .object({ data: z.array(chatMessageSchema).max(100), nextCursor: id.nullable() })
  .strict();
export const conversationReadSchema = z
  .object({ conversationId: id, lastReadAt: instantSchema })
  .strict();
export const chatPageQuerySchema = managementPageSchema;
export type ChatMessageInput = z.infer<typeof chatMessageInputSchema>;
export const CHAT_REALTIME_CHANNEL = 'hsm:chat:events';
export const chatRealtimeEventSchema = z
  .object({ conversationId: id, messageId: id, createdAt: instantSchema })
  .strict();
export const chatRealtimeJoinSchema = z
  .object({ conversationId: id, branchId: id.optional() })
  .strict();
