import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './index.js';
import { announcements, notificationOutbox, notifications } from './schema/index.js';
export const ANNOUNCEMENT_EVENT = 'announcement.deliver' as const;
import { announcementRecipientPages } from './announcement-audience.js';
const payloadSchema = z.object({ announcementId: z.string().uuid() }).strict();
type Lease = {
  id: string;
  payload: unknown;
  leaseToken: string | null;
  leaseExpiresAt: Date | null;
};
// One transaction under the live lease: plain-text in-app notices (deduplicated per user and
// announcement), the announcement marked sent with its count, and the job acknowledged.
// A cancelled announcement acknowledges without delivering. No SMS or WhatsApp is used.
export async function deliverAnnouncement(
  database: Database,
  lease: Lease,
  clock: () => Date = () => new Date(),
) {
  const { announcementId } = payloadSchema.parse(lease.payload);
  return database.transaction(
    async (tx) => {
      const now = clock();
      const [job] = await tx
        .select()
        .from(notificationOutbox)
        .where(eq(notificationOutbox.id, lease.id))
        .for('update');
      if (
        !job ||
        job.status !== 'pending' ||
        job.leaseToken === null ||
        job.leaseToken !== lease.leaseToken ||
        !job.leaseExpiresAt ||
        job.leaseExpiresAt <= now
      )
        return false;
      const [row] = await tx
        .select()
        .from(announcements)
        .where(eq(announcements.id, announcementId))
        .for('update');
      if (row?.status === 'scheduled') {
        let recipientCount = 0;
        for await (const recipients of announcementRecipientPages(tx, row)) {
          await tx
            .insert(notifications)
            .values(
              recipients.map((userId) => ({
                userId,
                type: 'platform.announcement',
                title: row.title,
                body: row.body,
                data: { announcementId: row.id },
                dedupeKey: 'announcement:' + row.id + ':' + userId,
                createdAt: now,
              })),
            )
            .onConflictDoNothing({ target: notifications.dedupeKey });
          recipientCount += recipients.length;
        }
        await tx
          .update(announcements)
          .set({ status: 'sent', sentAt: now, recipientCount })
          .where(eq(announcements.id, row.id));
      }
      await tx
        .update(notificationOutbox)
        .set({
          status: 'sent',
          sentAt: now,
          lastError: null,
          leaseToken: null,
          leaseExpiresAt: null,
        })
        .where(eq(notificationOutbox.id, lease.id));
      return true;
    },
    { isolationLevel: 'repeatable read' },
  );
}
