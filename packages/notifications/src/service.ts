import {
  InvalidNotificationJob,
  notificationDeliveryLeaseSchema,
  type NotificationMessage,
} from './contracts.js';
import type { NotificationStore } from './store.js';
export class NotificationService {
  constructor(
    private readonly store: NotificationStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async deliver(input: NotificationMessage) {
    const parsed = notificationDeliveryLeaseSchema.safeParse({
      id: input.id,
      eventType: input.eventType,
      channel: input.channel,
      recipientUserId: input.recipientUserId,
      payload: input.payload,
      leaseToken: input.leaseToken,
      leaseExpiresAt: input.leaseExpiresAt,
    });
    if (!parsed.success) throw new InvalidNotificationJob();
    const now = this.clock();
    if (parsed.data.leaseExpiresAt <= now) return;
    if (parsed.data.eventType === 'chat.lifecycle') {
      if (!this.store.publishChat) throw new InvalidNotificationJob();
      await this.store.publishChat(parsed.data, now);
    } else if (parsed.data.eventType === 'waitlist.lifecycle') {
      if (!this.store.publishWaitlist) throw new InvalidNotificationJob();
      await this.store.publishWaitlist(parsed.data, now);
    } else if (parsed.data.eventType === 'visit.lifecycle') {
      if (!this.store.publishVisit) throw new InvalidNotificationJob();
      await this.store.publishVisit(parsed.data, now);
    } else if (parsed.data.eventType === 'booking.lifecycle')
      await this.store.publishBooking(parsed.data, now);
    else if (parsed.data.eventType === 'resident.lifecycle')
      await this.store.publishResident(parsed.data, now);
    else if (parsed.data.eventType === 'resident.rent') {
      if (!this.store.publishRent) throw new InvalidNotificationJob();
      await this.store.publishRent(parsed.data, now);
    } else await this.store.publish(parsed.data, now);
  }
}
