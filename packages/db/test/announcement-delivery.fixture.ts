import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import {
  announcements,
  customerProfiles,
  notificationOutbox,
  notifications,
  users,
  type Database,
} from '../src/index.js';
export const announcementNow = new Date('2026-10-28T10:00:00Z');
export async function customerAudience(db: Database, size: number) {
  const ids = Array.from({ length: size }, () => randomUUID());
  for (let offset = 0; offset < size; offset += 500) {
    const page = ids.slice(offset, offset + 500);
    await db
      .insert(users)
      .values(page.map((id) => ({ id, fullName: 'Announcement Customer fixture' })));
    await db
      .insert(customerProfiles)
      .values(page.map((userId) => ({ userId, age: 21, profileCompletedAt: announcementNow })));
  }
  return ids;
}
export async function setActiveAudience(db: Database, ids: string[], count: number) {
  await db.update(users).set({ accountStatus: 'active' }).where(inArray(users.id, ids));
  if (count < ids.length)
    await db
      .update(users)
      .set({ accountStatus: 'suspended' })
      .where(inArray(users.id, ids.slice(count)));
}
export async function announcementFixture(
  db: Database,
  author: string,
  options: {
    audience?: 'customers' | 'all_managers' | 'selected_branches' | 'city';
    branchIds?: string[];
    cityId?: string;
  } = {},
) {
  const id = randomUUID();
  await db.insert(announcements).values({
    id,
    createdByUserId: author,
    audience: options.audience ?? 'customers',
    branchIds: options.branchIds ?? [],
    cityId: options.cityId,
    title: 'Maintenance',
    body: 'Plain text internal notice',
    status: 'scheduled',
    scheduledAt: announcementNow,
    version: 1,
  });
  const [job] = await db
    .insert(notificationOutbox)
    .values({
      eventType: 'announcement.deliver',
      channel: 'internal',
      payload: { announcementId: id },
      dedupeKey: 'announcement:' + id,
      leaseToken: randomUUID(),
      leaseExpiresAt: new Date(announcementNow.getTime() + 60000),
    })
    .returning();
  if (!job) throw new Error('Missing announcement job');
  return { id, job };
}
export const announcementNotices = (db: Database, id: string) =>
  db
    .select({ userId: notifications.userId })
    .from(notifications)
    .where(eq(notifications.data, { announcementId: id }));
// Inject a worker interruption after one real insert batch; actual PG rollback is required.
export function interruptAnnouncement(db: Database) {
  const transaction: Database['transaction'] = (work, config) =>
    db.transaction(async (tx) => {
      let inserts = 0;
      const insert = tx.insert.bind(tx);
      tx.insert = ((table: Parameters<typeof tx.insert>[0]) => {
        if (table === notifications && ++inserts === 2)
          throw new Error('Injected worker interruption');
        return insert(table);
      }) as typeof tx.insert;
      return work(tx);
    }, config);
  return new Proxy(db, {
    get(target, property) {
      return property === 'transaction' ? transaction : (Reflect.get(target, property) as unknown);
    },
  });
}
