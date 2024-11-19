import { z } from 'zod';
import { managementPageSchema } from './management.js';
export const reportReasonSchema = z.enum([
  'fake_listing',
  'wrong_price',
  'unsafe',
  'harassment',
  'scam',
  'inappropriate_chat',
  'spam',
  'other',
]);
export const reportStatusSchema = z.enum(['open', 'investigating', 'actioned', 'dismissed']);
export const chatReportInputSchema = z
  .object({
    targetType: z.literal('chat_message'),
    targetId: z
      .string()
      .uuid()
      .transform((value) => value.toLowerCase()),
    reason: reportReasonSchema,
    details: z.string().trim().min(1).max(4000).optional(),
  })
  .strict();
export const chatReportSchema = z
  .object({
    id: z.string().uuid(),
    reporterUserId: z.string().uuid(),
    targetType: z.literal('chat_message'),
    targetId: z.string().uuid(),
    reason: reportReasonSchema,
    details: z.string().max(4000).nullable(),
    status: reportStatusSchema,
    createdAt: z.string().datetime(),
  })
  .strict();
export const chatReportPageQuerySchema = managementPageSchema
  .extend({
    status: reportStatusSchema.optional(),
    targetType: z.literal('chat_message').optional(),
  })
  .strict();
export const chatReportPageSchema = z
  .object({ data: z.array(chatReportSchema).max(100), nextCursor: z.string().uuid().nullable() })
  .strict();
export const chatSafetyAccessSchema = z
  .object({ justification: z.string().trim().min(1).max(1000) })
  .strict();
export const chatSafetyMessageSchema = z
  .object({
    id: z.string().uuid(),
    senderSide: z.enum(['customer', 'branch']),
    body: z.string().min(1).max(4000).nullable(),
    attachmentCount: z.number().int().min(0).max(5),
    createdAt: z.string().datetime(),
    removed: z.boolean(),
  })
  .strict();
export const chatSafetyContextSchema = z
  .object({
    reportId: z.string().uuid(),
    reportedMessageId: z.string().uuid(),
    messages: z.array(chatSafetyMessageSchema).min(1).max(5),
  })
  .strict()
  .superRefine((value, ctx) => {
    const target = value.messages.findIndex((row) => row.id === value.reportedMessageId);
    if (target < 0 || target > 2 || value.messages.length - target - 1 > 2)
      ctx.addIssue({
        code: 'custom',
        path: ['messages'],
        message: 'Reported message window required',
      });
    for (let index = 1; index < value.messages.length; index++) {
      if ((value.messages[index - 1]?.id ?? '') >= (value.messages[index]?.id ?? ''))
        ctx.addIssue({
          code: 'custom',
          path: ['messages'],
          message: 'Ordered unique message window required',
        });
    }
  });
export type ChatReportInput = z.infer<typeof chatReportInputSchema>;
