import { z } from 'zod';
import { notificationOutbox, waitlistFanoutPages } from './schema/index.js';
import type { Database } from './index.js';
export const waitlistLifecyclePayloadSchema = z
  .object({ event: z.literal('waitlist.vacancy'), pageId: z.string().uuid() })
  .strict();
export type WaitlistTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];
// Caller provides an immutable page proof. Source events carry no recipient account identifiers.
export async function enqueueWaitlistPage(
  tx: WaitlistTransaction,
  page: {
    id: string;
    branchId: string;
    eventId: string;
    afterEntryId: string | null;
    createdAt: Date;
  },
  now: Date,
) {
  const payload = waitlistLifecyclePayloadSchema.parse({
    event: 'waitlist.vacancy',
    pageId: page.id,
  });
  await tx.insert(waitlistFanoutPages).values(page);
  await tx
    .insert(notificationOutbox)
    .values({
      eventType: 'waitlist.lifecycle',
      channel: 'in_app',
      recipientUserId: null,
      payload,
      dedupeKey: 'waitlist.page:' + payload.pageId,
      createdAt: now,
      nextAttemptAt: now,
    });
}
