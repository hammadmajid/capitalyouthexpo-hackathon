import { ANNOUNCEMENT_EVENT, InvalidResidentBillingJob, RESIDENT_BILLING_EVENT } from '@hsm/db';
import type { Logger } from 'pino';
import { InvalidNotificationJob, type NotificationService } from '@hsm/notifications';
import { InvalidScanJob, type FileScanService } from '@hsm/files';
import { DeliveryError, deliverEmail, type EmailProvider } from './delivery.js';
import type { OutboxMessage, OutboxRepository } from './repository.js';
import { InvalidChatRealtimeJob } from './chat-realtime.js';
export type BillingDelivery = { deliver(row: OutboxMessage): Promise<void> };
async function deliverInternal(
  row: OutboxMessage,
  files?: Pick<FileScanService, 'deliver'>,
  billing?: BillingDelivery,
  realtime?: BillingDelivery,
  announcements?: BillingDelivery,
) {
  // ADM-010: scheduled platform announcements fan out to in-app notices.
  if (row.eventType === ANNOUNCEMENT_EVENT) {
    if (!announcements) throw new Error('ANNOUNCEMENT_SERVICE_UNAVAILABLE');
    await announcements.deliver(row);
    return;
  }
  if (row.eventType === 'chat.realtime') {
    if (!realtime) throw new Error('CHAT_REALTIME_UNAVAILABLE');
    await realtime.deliver(row);
    return;
  }
  if (row.eventType === 'files.scan') {
    if (!files) throw new Error('FILE_SERVICE_UNAVAILABLE');
    await files.deliver(row);
    return;
  }
  if (row.eventType === RESIDENT_BILLING_EVENT) {
    if (!billing) throw new Error('BILLING_SERVICE_UNAVAILABLE');
    await billing.deliver(row);
    return;
  }
  throw new DeliveryError('INVALID_MESSAGE');
}
function invalidInternal(error: unknown) {
  return (
    error instanceof InvalidScanJob ||
    error instanceof InvalidNotificationJob ||
    error instanceof InvalidResidentBillingJob ||
    error instanceof InvalidChatRealtimeJob
  );
}
export async function processDelivery(
  row: OutboxMessage,
  repository: OutboxRepository,
  provider: EmailProvider,
  key: Buffer,
  logger: Logger,
  files?: Pick<FileScanService, 'deliver'>,
  notices?: Pick<NotificationService, 'deliver'>,
  billing?: BillingDelivery,
  realtime?: BillingDelivery,
  announcements?: BillingDelivery,
) {
  try {
    if (row.channel === 'in_app') {
      if (!notices) throw new Error('NOTIFICATION_SERVICE_UNAVAILABLE');
      await notices.deliver(row);
      return;
    }
    if (row.channel === 'internal') {
      // Each internal service owns its transactional acknowledgement.
      await deliverInternal(row, files, billing, realtime, announcements);
      return;
    }
    const messageId = await deliverEmail(row, key, provider, new Date());
    await repository.sent(row, messageId, new Date());
  } catch (error) {
    const code = invalidInternal(error)
      ? 'INVALID_MESSAGE'
      : error instanceof DeliveryError
        ? error.code
        : 'DELIVERY_FAILED';
    await repository.failed(row, code, new Date());
    logger.warn({ code, outboxId: row.id }, 'Notification delivery deferred or rejected');
    throw new Error(code);
  }
}
