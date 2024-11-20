import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { announcements, deliverAnnouncement, notificationOutbox, users } from '../src/index.js';
import { inventoryHarness } from './inventory.fixture.js';
import {
  announcementFixture,
  announcementNotices,
  announcementNow as now,
  customerAudience,
  interruptAnnouncement,
  setActiveAudience,
} from './announcement-delivery.fixture.js';
const h = inventoryHarness();
let author: string, ids: string[];
beforeAll(async () => {
  await h.start();
  author = randomUUID();
  await h.database().insert(users).values({ id: author, fullName: 'Announcement author fixture' });
  ids = await customerAudience(h.database(), 5001);
});
afterAll(() => h.close());
it.each([1, 5000, 5001])(
  'AUD-008 / ADM-010: every one of %i distinct active Customers receives one notice before acknowledgement',
  async (count) => {
    await setActiveAudience(h.database(), ids, count);
    const f = await announcementFixture(h.database(), author);
    expect(await deliverAnnouncement(h.database(), f.job, () => now)).toBe(true);
    const rows = await announcementNotices(h.database(), f.id);
    expect(rows).toHaveLength(count);
    expect(new Set(rows.map((row) => row.userId))).toEqual(new Set(ids.slice(0, count)));
    const [done] = await h
      .database()
      .select()
      .from(announcements)
      .where(eq(announcements.id, f.id));
    expect(done).toMatchObject({ status: 'sent', recipientCount: count });
    expect(await deliverAnnouncement(h.database(), f.job, () => now)).toBe(false);
  },
);
it('AUD-008 / ACC-004: worker failure between real batches rolls back all notices and retry commits once', async () => {
  const f = await announcementFixture(h.database(), author);
  await expect(
    deliverAnnouncement(interruptAnnouncement(h.database()), f.job, () => now),
  ).rejects.toThrow('Injected worker interruption');
  expect(await announcementNotices(h.database(), f.id)).toEqual([]);
  const [before] = await h
    .database()
    .select()
    .from(announcements)
    .where(eq(announcements.id, f.id));
  const [job] = await h
    .database()
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.id, f.job.id));
  expect(before).toMatchObject({ status: 'scheduled', recipientCount: null, sentAt: null });
  expect(job).toMatchObject({ status: 'pending', leaseToken: f.job.leaseToken });
  expect(await deliverAnnouncement(h.database(), f.job, () => now)).toBe(true);
  expect(await announcementNotices(h.database(), f.id)).toHaveLength(5001);
  expect(await deliverAnnouncement(h.database(), f.job, () => now)).toBe(false);
});
it('AUD-008 / ADM-010: cancellation acknowledges without delivery and expired or mismatched leases do not acknowledge', async () => {
  const cancelled = await announcementFixture(h.database(), author);
  await h
    .database()
    .update(announcements)
    .set({ status: 'cancelled' })
    .where(eq(announcements.id, cancelled.id));
  expect(await deliverAnnouncement(h.database(), cancelled.job, () => now)).toBe(true);
  expect(await announcementNotices(h.database(), cancelled.id)).toEqual([]);
  const f = await announcementFixture(h.database(), author);
  expect(
    await deliverAnnouncement(h.database(), { ...f.job, leaseToken: randomUUID() }, () => now),
  ).toBe(false);
  expect(
    await deliverAnnouncement(h.database(), f.job, () => new Date(now.getTime() + 60000)),
  ).toBe(false);
  expect(await announcementNotices(h.database(), f.id)).toEqual([]);
  const [job] = await h
    .database()
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.id, f.job.id));
  expect(job?.status).toBe('pending');
});
