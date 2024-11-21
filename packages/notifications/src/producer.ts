import { notificationOutbox, type Database } from '@hsm/db';
import { enqueueNotificationSchema, type EnqueueNotification } from './contracts.js';
export type NotificationTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];
// NTF-002: only the caller's business transaction can enqueue the immutable notice.
export class NotificationProducer {
  async enqueue(transaction: NotificationTransaction, input: EnqueueNotification, now: Date) {
    const event = enqueueNotificationSchema.parse(input);
    await transaction
      .insert(notificationOutbox)
      .values({
        eventType: 'notification.create',
        channel: 'in_app',
        recipientUserId: event.userId,
        payload: { event: event.event, operationId: event.operationId },
        dedupeKey: 'in_app:' + event.userId + ':' + event.event + ':' + event.operationId,
        createdAt: now,
        nextAttemptAt: now,
      })
      .onConflictDoNothing({ target: notificationOutbox.dedupeKey });
  }
}
