import { eq } from 'drizzle-orm';
import {
  chatLifecyclePayloadSchema,
  chatMessages,
  notificationOutbox,
  type Database,
} from '@hsm/db';
import { CHAT_REALTIME_CHANNEL, chatRealtimeEventSchema } from '@hsm/contracts';
import type { OutboxMessage } from './repository.js';
export class InvalidChatRealtimeJob extends Error {
  constructor() {
    super('INVALID_CHAT_REALTIME_JOB');
  }
}
export class ChatRealtimeDelivery {
  constructor(
    private readonly db: Database,
    private readonly publisher: { publish(channel: string, message: string): Promise<number> },
    private readonly clock: () => Date = () => new Date(),
  ) {}
  deliver(lease: OutboxMessage) {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(notificationOutbox)
        .where(eq(notificationOutbox.id, lease.id))
        .for('update');
      const now = () => this.clock();
      if (
        !row ||
        ['sent', 'dead'].includes(row.status) ||
        row.eventType !== 'chat.realtime' ||
        row.channel !== 'internal' ||
        row.recipientUserId !== null ||
        !row.leaseToken ||
        row.leaseToken !== lease.leaseToken ||
        !row.leaseExpiresAt ||
        row.leaseExpiresAt <= now()
      )
        return;
      const payload = chatLifecyclePayloadSchema.safeParse(row.payload);
      if (!payload.success) throw new InvalidChatRealtimeJob();
      const [message] = await tx
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.id, payload.data.messageId));
      if (!message) throw new InvalidChatRealtimeJob();
      if (!message.deletedAt) {
        const event = chatRealtimeEventSchema.parse({
          conversationId: message.conversationId,
          messageId: message.id,
          createdAt: message.createdAt.toISOString(),
        });
        if (row.leaseExpiresAt <= now()) throw new Error('Realtime lease expired');
        await this.publisher.publish(CHAT_REALTIME_CHANNEL, JSON.stringify(event));
      }
      if (row.leaseExpiresAt <= now()) throw new Error('Realtime lease expired');
      await tx
        .update(notificationOutbox)
        .set({
          status: 'sent',
          sentAt: now(),
          leaseToken: null,
          leaseExpiresAt: null,
          lastError: null,
        })
        .where(eq(notificationOutbox.id, row.id));
    });
  }
}
