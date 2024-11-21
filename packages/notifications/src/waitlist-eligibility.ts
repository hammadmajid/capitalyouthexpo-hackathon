import { eq } from 'drizzle-orm';
import { lockInventoryBranch, reconcileWaitlistAvailability, waitlistVacancyEvents } from '@hsm/db';
import { InvalidNotificationJob } from './contracts.js';
import type { NotificationTransaction } from './producer.js';
import { waitlistRecipientPage } from './waitlist-recipients.js';
// WAIT-001: leaving, account suspension or new inventory claims suppress queued alerts too.
export async function waitlistNoticeEligible(
  tx: NotificationTransaction,
  userId: string,
  eventId: string,
  now: Date,
) {
  const [event] = await tx
    .select()
    .from(waitlistVacancyEvents)
    .where(eq(waitlistVacancyEvents.id, eventId));
  if (!event) throw new InvalidNotificationJob();
  await lockInventoryBranch(tx, event.branchId);
  await reconcileWaitlistAvailability(tx, event.branchId, now, event.roomTypeId ?? undefined);
  return (await waitlistRecipientPage(tx, event, null, userId)).length > 0;
}
