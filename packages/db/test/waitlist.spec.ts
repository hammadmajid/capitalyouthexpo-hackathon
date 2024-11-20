import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { v7 } from 'uuid';
import {
  enqueueWaitlistPage,
  notificationOutbox,
  waitlistEntries,
  waitlistAvailability,
  waitlistFanoutPages,
  waitlistVacancyEvents,
} from '../src/index.js';
import { inventoryHarness } from './inventory.fixture.js';
// WAIT-001 / ACC-002/003/006: IMPLEMENTED — NOT RUN — DEFERRED TO PHASE10.
const harness = inventoryHarness(),
  now = new Date('2026-10-22T03:00:00Z');
beforeAll(() => harness.start());
afterAll(() => harness.close());
async function prepare() {
  const scope = await harness.scope();
  return {
    ...scope,
    entry: {
      id: v7(),
      branchId: scope.branchId,
      roomTypeId: scope.roomTypeId,
      customerUserId: scope.customerA,
      joinedAt: now,
    },
  };
}
it('WAIT-001 / ACC-003: concurrent duplicate active preferences admit exactly one entry', async () => {
  const f = await prepare();
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      harness
        .database()
        .insert(waitlistEntries)
        .values({ ...f.entry, id: v7() }),
    ),
  );
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
});
it('WAIT-001: any-room preference is separately deduplicated and leaving retains history while allowing explicit rejoin', async () => {
  const f = await prepare(),
    any = { ...f.entry, roomTypeId: null };
  await harness.database().insert(waitlistEntries).values(any);
  await expect(
    harness
      .database()
      .insert(waitlistEntries)
      .values({ ...any, id: v7() }),
  ).rejects.toThrow();
  await harness
    .database()
    .update(waitlistEntries)
    .set({ leftAt: new Date(now.getTime() + 1) })
    .where(eq(waitlistEntries.id, any.id));
  await harness
    .database()
    .insert(waitlistEntries)
    .values({ ...any, id: v7() });
  const rows = await harness
    .database()
    .select()
    .from(waitlistEntries)
    .where(eq(waitlistEntries.branchId, f.branchId));
  expect(rows).toHaveLength(2);
  expect(rows.filter((row) => row.leftAt === null)).toHaveLength(1);
});
it('WAIT-001 / ACC-002: a room preference cannot reference another branch', async () => {
  const f = await prepare(),
    foreign = await harness.scope();
  await expect(
    harness
      .database()
      .insert(waitlistEntries)
      .values({ ...f.entry, roomTypeId: foreign.roomTypeId }),
  ).rejects.toThrow();
});
it('WAIT-001: a departure timestamp cannot precede joining', async () => {
  const f = await prepare();
  await expect(
    harness
      .database()
      .insert(waitlistEntries)
      .values({ ...f.entry, leftAt: new Date(now.getTime() - 1) }),
  ).rejects.toThrow();
});
async function event() {
  const f = await prepare(),
    proof = {
      id: v7(),
      branchId: f.branchId,
      roomTypeId: null,
      branchBecameAvailable: true,
      typeBecameAvailable: false,
      availableOn: '2026-10-22',
      createdAt: now,
    };
  await harness.database().insert(waitlistVacancyEvents).values(proof);
  return { ...f, proof };
}
it('WAIT-001 / ACC-006: immutable vacancy events reject update, delete and truncate', async () => {
  const f = await event();
  await expect(
    harness
      .database()
      .update(waitlistVacancyEvents)
      .set({ availableOn: '2026-10-23' })
      .where(eq(waitlistVacancyEvents.id, f.proof.id)),
  ).rejects.toThrow();
  await expect(
    harness
      .database()
      .delete(waitlistVacancyEvents)
      .where(eq(waitlistVacancyEvents.id, f.proof.id)),
  ).rejects.toThrow();
  await expect(
    harness.database().execute(sql`TRUNCATE waitlist_vacancy_events CASCADE`),
  ).rejects.toThrow();
});
it('WAIT-001 / ACC-002: an availability observation cannot borrow a foreign event', async () => {
  const f = await event(),
    foreign = await harness.scope();
  await expect(
    harness
      .database()
      .insert(waitlistAvailability)
      .values({
        id: v7(),
        branchId: foreign.branchId,
        available: true,
        eventId: f.proof.id,
        checkedAt: now,
      }),
  ).rejects.toThrow();
});
it('WAIT-001 / ACC-006: durable pages and their source outbox roll back together on an actual dedupe violation', async () => {
  const f = await event(),
    page = {
      id: v7(),
      branchId: f.branchId,
      eventId: f.proof.id,
      afterEntryId: null,
      createdAt: now,
    };
  await harness
    .database()
    .insert(notificationOutbox)
    .values({
      eventType: 'waitlist.lifecycle',
      channel: 'in_app',
      recipientUserId: null,
      payload: { event: 'waitlist.vacancy', pageId: page.id },
      dedupeKey: 'waitlist.page:' + page.id,
      createdAt: now,
      nextAttemptAt: now,
    });
  await expect(
    harness.database().transaction((tx) => enqueueWaitlistPage(tx, page, now)),
  ).rejects.toThrow();
  expect(
    await harness
      .database()
      .select()
      .from(waitlistFanoutPages)
      .where(eq(waitlistFanoutPages.id, page.id)),
  ).toHaveLength(0);
});
it('WAIT-001 / ACC-006: immutable fanout pages reject mutation while preserving their branch-bound source', async () => {
  const f = await event(),
    page = {
      id: v7(),
      branchId: f.branchId,
      eventId: f.proof.id,
      afterEntryId: null,
      createdAt: now,
    };
  await harness.database().transaction((tx) => enqueueWaitlistPage(tx, page, now));
  await expect(
    harness
      .database()
      .update(waitlistFanoutPages)
      .set({ afterEntryId: v7() })
      .where(eq(waitlistFanoutPages.id, page.id)),
  ).rejects.toThrow();
  await expect(
    harness.database().delete(waitlistFanoutPages).where(eq(waitlistFanoutPages.id, page.id)),
  ).rejects.toThrow();
  await expect(harness.database().execute(sql`TRUNCATE waitlist_fanout_pages`)).rejects.toThrow();
});
