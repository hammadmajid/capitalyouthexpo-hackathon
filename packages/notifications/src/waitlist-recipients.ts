import { and, eq, gt, isNull, lte, or } from 'drizzle-orm';
import { waitlistEntries, waitlistAvailability, users, type waitlistVacancyEvents } from '@hsm/db';
import type { NotificationTransaction } from './producer.js';
export async function waitlistRecipientPage(
  tx: NotificationTransaction,
  event: typeof waitlistVacancyEvents.$inferSelect,
  afterEntryId: string | null,
  userId?: string,
) {
  const observations = await tx
    .select({ roomTypeId: waitlistAvailability.roomTypeId })
    .from(waitlistAvailability)
    .where(
      and(
        eq(waitlistAvailability.branchId, event.branchId),
        eq(waitlistAvailability.eventId, event.id),
        eq(waitlistAvailability.available, true),
      ),
    );
  const anyRoom =
    event.branchBecameAvailable && observations.some((row) => row.roomTypeId === null);
  const namedType =
    event.typeBecameAvailable &&
    event.roomTypeId !== null &&
    observations.some((row) => row.roomTypeId === event.roomTypeId);
  if (!anyRoom && !namedType) return [];
  return tx
    .select({ id: waitlistEntries.id, userId: waitlistEntries.customerUserId })
    .from(waitlistEntries)
    .innerJoin(users, eq(users.id, waitlistEntries.customerUserId))
    .where(
      and(
        eq(waitlistEntries.branchId, event.branchId),
        isNull(waitlistEntries.leftAt),
        lte(waitlistEntries.joinedAt, event.createdAt),
        eq(users.accountStatus, 'active'),
        userId ? eq(waitlistEntries.customerUserId, userId) : undefined,
        afterEntryId ? gt(waitlistEntries.id, afterEntryId) : undefined,
        or(
          anyRoom ? isNull(waitlistEntries.roomTypeId) : undefined,
          namedType && event.roomTypeId
            ? eq(waitlistEntries.roomTypeId, event.roomTypeId)
            : undefined,
        ),
      ),
    )
    .orderBy(waitlistEntries.id)
    .limit(101);
}
