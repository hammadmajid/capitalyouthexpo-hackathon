import { z } from 'zod';
export const chatLifecyclePayloadSchema = z
  .object({ event: z.literal('chat.message.created'), messageId: z.string().uuid() })
  .strict();
