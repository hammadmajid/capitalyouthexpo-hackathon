import { eq } from 'drizzle-orm';
import { chatLifecyclePayloadSchema, notificationOutbox, type Database } from '@hsm/db';
import type { ChatLifecycleLease } from './contracts.js';
import { NotificationProducer } from './producer.js';
import { chatRecipients } from './chat-recipients.js';
export function publishChatLifecycle(
  db: Database,
  lease: ChatLifecycleLease,
  requestedAt: Date,
  clock: () => Date,
) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.id, lease.id))
      .for('update');
    const now = () => new Date(Math.max(requestedAt.getTime(), clock().getTime()));
    if (
      !row ||
      ['sent', 'dead'].includes(row.status) ||
      row.eventType !== 'chat.lifecycle' ||
      row.channel !== 'in_app' ||
      row.recipientUserId !== null ||
      row.leaseToken !== lease.leaseToken ||
      !row.leaseExpiresAt ||
      row.leaseExpiresAt <= now()
    )
      return false;
    const payload = chatLifecyclePayloadSchema.safeParse(row.payload);
    if (!payload.success || payload.data.messageId !== lease.payload.messageId) return false;
    const targets = await chatRecipients(tx, payload.data.messageId),
      producer = new NotificationProducer();
    const requireLease = () => {
      if (!row.leaseExpiresAt || row.leaseExpiresAt <= now())
        throw new Error('Chat notice lease expired');
    };
    for (const userId of targets) {
      requireLease();
      await producer.enqueue(
        tx,
        { userId, event: 'chat.message.created', operationId: payload.data.messageId },
        now(),
      );
    }
    requireLease();
    await tx
      .insert(notificationOutbox)
      .values({
        eventType: 'chat.realtime',
        channel: 'internal',
        recipientUserId: null,
        payload: payload.data,
        dedupeKey: 'chat.realtime:' + payload.data.messageId,
        createdAt: now(),
        nextAttemptAt: now(),
      })
      .onConflictDoNothing({ target: notificationOutbox.dedupeKey });
    requireLease();
    await tx
      .update(notificationOutbox)
      .set({
        status: 'sent',
        sentAt: now(),
        lastError: null,
        leaseToken: null,
        leaseExpiresAt: null,
      })
      .where(eq(notificationOutbox.id, row.id));
    return true;
  });
}
