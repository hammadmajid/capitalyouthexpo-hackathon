import { publishVisitLifecycle } from './visit.repository.js';
import { publishChatLifecycle } from './chat.repository.js';
import { publishWaitlistLifecycle } from './waitlist.repository.js';
import { notificationEligible } from './eligibility.js';
import { publishResidentLifecycle } from './resident.repository.js';
import { publishResidentRent } from './rent.repository.js';
import { publishBookingLifecycle } from './booking.repository.js';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { notifications, notificationOutbox, type Database } from '@hsm/db';
import {
  type VisitLifecycleLease,
  type ChatLifecycleLease,
  type WaitlistLifecycleLease,
  notificationJobSchema,
  type BookingLifecycleLease,
  type ResidentLifecycleLease,
  type ResidentRentLease,
  type NotificationLease,
} from './contracts.js';
import { renderNotification } from './templates.js';
import type { NotificationStore } from './store.js';
export class NotificationRepository implements NotificationStore {
  constructor(
    private readonly database: Database,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  publishVisit(lease: VisitLifecycleLease, requestedAt: Date) {
    return publishVisitLifecycle(this.database, lease, requestedAt, this.clock);
  }
  publishChat(lease: ChatLifecycleLease, requestedAt: Date) {
    return publishChatLifecycle(this.database, lease, requestedAt, this.clock);
  }
  publishWaitlist(lease: WaitlistLifecycleLease, requestedAt: Date) {
    return publishWaitlistLifecycle(this.database, lease, requestedAt, this.clock);
  }
  publishResident(lease: ResidentLifecycleLease, requestedAt: Date) {
    return publishResidentLifecycle(this.database, lease, requestedAt, this.clock);
  }
  publishRent(lease: ResidentRentLease, requestedAt: Date) {
    return publishResidentRent(this.database, lease, requestedAt, this.clock);
  }
  publishBooking(lease: BookingLifecycleLease, requestedAt: Date) {
    return publishBookingLifecycle(this.database, lease, requestedAt, this.clock);
  }
  publish(lease: NotificationLease, requestedAt: Date) {
    return this.database.transaction(async (transaction) => {
      const [row] = await transaction
        .select()
        .from(notificationOutbox)
        .where(eq(notificationOutbox.id, lease.id))
        .for('update');
      // NTF-002: lock waits must not extend an expired delivery lease.
      const now = new Date(Math.max(this.clock().getTime(), requestedAt.getTime()));
      if (
        !row ||
        row.status === 'sent' ||
        row.status === 'dead' ||
        row.leaseToken !== lease.leaseToken ||
        !row.leaseExpiresAt ||
        row.leaseExpiresAt <= now ||
        row.channel !== 'in_app' ||
        row.eventType !== 'notification.create' ||
        row.recipientUserId !== lease.recipientUserId
      )
        return false;
      const job = notificationJobSchema.safeParse(row.payload);
      if (
        !job.success ||
        job.data.event !== lease.payload.event ||
        job.data.operationId !== lease.payload.operationId
      )
        return false;
      const eligible = await notificationEligible(
        transaction,
        lease.recipientUserId,
        job.data,
        now,
      );
      const expiresAt = row.leaseExpiresAt;
      const requireLease = () => {
        if (expiresAt.getTime() <= Math.max(this.clock().getTime(), requestedAt.getTime()))
          throw new Error('Notification lease expired');
      };
      requireLease();
      if (eligible)
        await transaction
          .insert(notifications)
          .values({
            id: randomUUID(),
            userId: row.recipientUserId,
            ...renderNotification(job.data.event),
            dedupeKey: 'notification:' + row.id,
            createdAt: now,
          })
          .onConflictDoNothing({ target: notifications.dedupeKey });
      requireLease();
      await transaction
        .update(notificationOutbox)
        .set({
          status: 'sent',
          sentAt: now,
          lastError: null,
          leaseToken: null,
          leaseExpiresAt: null,
        })
        .where(eq(notificationOutbox.id, row.id));
      return true;
    });
  }
}
