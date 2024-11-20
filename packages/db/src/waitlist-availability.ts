import { and, eq, isNull } from 'drizzle-orm';
import { v7 } from 'uuid';
import { waitlistAvailability, waitlistVacancyEvents } from './schema/waitlist-events.js';
import { waitlistEntries } from './schema/waitlist.js';
import { readPublicInventoryBranch } from './inventory-public-branch.js';
import { hasOperationalInventoryAvailability } from './inventory-operational-availability.js';
import { enqueueWaitlistPage, type WaitlistTransaction } from './waitlist-lifecycle.js';
import { DomainError } from '@hsm/contracts';
export function waitlistToday(now: Date) {
  if (!Number.isFinite(now.getTime()))
    throw new DomainError('VALIDATION_FAILED', 422, 'Invalid clock');
  return new Date(now.getTime() + 5 * 3600000).toISOString().slice(0, 10);
}
export function waitlistTodayRange(now: Date) {
  const moveInDate = waitlistToday(now);
  return {
    moveInDate,
    moveOutDate: new Date(Date.parse(moveInDate + 'T00:00:00Z') + 86400000)
      .toISOString()
      .slice(0, 10),
  };
}
async function state(tx: WaitlistTransaction, branchId: string, roomTypeId?: string) {
  const [row] = await tx
    .select()
    .from(waitlistAvailability)
    .where(
      and(
        eq(waitlistAvailability.branchId, branchId),
        roomTypeId
          ? eq(waitlistAvailability.roomTypeId, roomTypeId)
          : isNull(waitlistAvailability.roomTypeId),
      ),
    )
    .limit(1);
  return row;
}
async function save(
  tx: WaitlistTransaction,
  branchId: string,
  roomTypeId: string | null,
  available: boolean,
  before: typeof waitlistAvailability.$inferSelect | undefined,
  eventId: string | null,
  now: Date,
) {
  const values = { available, eventId: available ? eventId : null, checkedAt: now };
  if (before)
    await tx.update(waitlistAvailability).set(values).where(eq(waitlistAvailability.id, before.id));
  else await tx.insert(waitlistAvailability).values({ id: v7(), branchId, roomTypeId, ...values });
}
// Caller owns the standard inventory hierarchy lock. Observations are NOT booking authority.
export async function reconcileWaitlistAvailability(
  tx: WaitlistTransaction,
  branchId: string,
  now: Date,
  roomTypeId?: string,
) {
  const [subscribed] = await tx
    .select({ id: waitlistEntries.id })
    .from(waitlistEntries)
    .where(and(eq(waitlistEntries.branchId, branchId), isNull(waitlistEntries.leftAt)))
    .limit(1);
  if (!subscribed) return 0;
  const range = waitlistTodayRange(now),
    publicBranch = await readPublicInventoryBranch(tx, branchId, true);
  const branchAvailable =
    Boolean(publicBranch) && (await hasOperationalInventoryAvailability(tx, branchId, range, now));
  const typeAvailable =
    Boolean(publicBranch && roomTypeId) &&
    (await hasOperationalInventoryAvailability(tx, branchId, range, now, roomTypeId));
  const branch = await state(tx, branchId),
    type = roomTypeId ? await state(tx, branchId, roomTypeId) : undefined;
  const branchBecameAvailable = Boolean(branch && !branch.available && branchAvailable),
    typeBecameAvailable = Boolean(type && !type.available && typeAvailable);
  let eventId: string | null = null;
  if (branchBecameAvailable || typeBecameAvailable) {
    eventId = v7();
    await tx
      .insert(waitlistVacancyEvents)
      .values({
        id: eventId,
        branchId,
        roomTypeId: roomTypeId ?? null,
        branchBecameAvailable,
        typeBecameAvailable,
        availableOn: range.moveInDate,
        createdAt: now,
      });
    await enqueueWaitlistPage(
      tx,
      { id: v7(), branchId, eventId, afterEntryId: null, createdAt: now },
      now,
    );
  }
  await save(
    tx,
    branchId,
    null,
    branchAvailable,
    branch,
    branchBecameAvailable ? eventId : (branch?.eventId ?? null),
    now,
  );
  if (roomTypeId)
    await save(
      tx,
      branchId,
      roomTypeId,
      typeAvailable,
      type,
      typeBecameAvailable ? eventId : (type?.eventId ?? null),
      now,
    );
  return eventId === null ? 0 : 1;
}
