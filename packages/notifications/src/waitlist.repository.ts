import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  enqueueWaitlistPage,
  lockInventoryBranch,
  notificationOutbox,
  reconcileWaitlistAvailability,
  waitlistFanoutPages,
  waitlistLifecyclePayloadSchema,
  waitlistVacancyEvents,
  type Database,
} from '@hsm/db';
import { InvalidNotificationJob, type WaitlistLifecycleLease } from './contracts.js';
import { NotificationProducer, type NotificationTransaction } from './producer.js';
import { waitlistRecipientPage } from './waitlist-recipients.js';
async function source(tx: NotificationTransaction, pageId: string) {
  const [page] = await tx
    .select()
    .from(waitlistFanoutPages)
    .where(eq(waitlistFanoutPages.id, pageId));
  if (!page) throw new InvalidNotificationJob();
  const [event] = await tx
    .select()
    .from(waitlistVacancyEvents)
    .where(
      and(
        eq(waitlistVacancyEvents.id, page.eventId),
        eq(waitlistVacancyEvents.branchId, page.branchId),
      ),
    );
  if (!event) throw new InvalidNotificationJob();
  return { page, event };
}
function validLease(
  row: typeof notificationOutbox.$inferSelect | undefined,
  lease: WaitlistLifecycleLease,
  now: Date,
) {
  if (
    !row ||
    ['sent', 'dead'].includes(row.status) ||
    row.eventType !== 'waitlist.lifecycle' ||
    row.channel !== 'in_app' ||
    row.recipientUserId !== null ||
    row.leaseToken !== lease.leaseToken ||
    !row.leaseExpiresAt ||
    row.leaseExpiresAt <= now
  )
    return false;
  const payload = waitlistLifecyclePayloadSchema.safeParse(row.payload);
  return payload.success && payload.data.pageId === lease.payload.pageId;
}
export function publishWaitlistLifecycle(
  db: Database,
  lease: WaitlistLifecycleLease,
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
    if (!validLease(row, lease, now()) || !row?.leaseExpiresAt) return false;
    const { page, event } = await source(tx, lease.payload.pageId);
    await lockInventoryBranch(tx, event.branchId);
    await reconcileWaitlistAvailability(tx, event.branchId, now(), event.roomTypeId ?? undefined);
    const recipients = await waitlistRecipientPage(tx, event, page.afterEntryId),
      producer = new NotificationProducer();
    function requireLease() {
      if (!row?.leaseExpiresAt || row.leaseExpiresAt <= now())
        throw new Error('Waiting-list notice lease expired');
    }
    for (const recipient of recipients.slice(0, 100)) {
      requireLease();
      await producer.enqueue(
        tx,
        { userId: recipient.userId, event: 'waitlist.vacancy', operationId: event.id },
        now(),
      );
    }
    const last = recipients[99];
    if (recipients.length > 100 && last) {
      requireLease();
      await enqueueWaitlistPage(
        tx,
        {
          id: randomUUID(),
          branchId: event.branchId,
          eventId: event.id,
          afterEntryId: last.id,
          createdAt: now(),
        },
        now(),
      );
    }
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
