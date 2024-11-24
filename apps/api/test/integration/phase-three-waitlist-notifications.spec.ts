import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  inventoryClaims,
  notifications,
  notificationOutbox,
  rooms,
  sweepWaitlistAvailability,
  users,
  waitlistEntries,
  waitlistFanoutPages,
  waitlistVacancyEvents,
  type Database,
} from '@hsm/db';
import { NotificationRepository, NotificationService } from '@hsm/notifications';
import { phaseTwoFixture } from './phase-two-fixture.js';
import { giveNotice } from './waitlist-notice.fixture.js';
const base = new Date('2026-10-24T03:00:00Z');
let clock = base,
  f: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  f = await phaseTwoFixture(base, () => clock);
});
beforeEach(() => {
  clock = base;
});
afterAll(async () => {
  await f?.close();
});
async function prepare() {
  const scope = await f.inventory(),
    db = f.connection.db;
  await db.update(rooms).set({ status: 'inactive' }).where(eq(rooms.id, scope.roomId));
  await giveNotice(f, scope);
  for (const token of [f.customerAToken, f.customerBToken]) {
    const response = await f.application.inject({
      method: 'POST',
      url: '/v1/me/waitlist',
      headers: {
        authorization: 'Bearer ' + token,
        'Idempotency-Key': randomUUID(),
        'Content-Type': 'application/json',
      },
      payload: JSON.stringify({ branchId: scope.branchId }),
    });
    expect(response.statusCode).toBe(200);
  }
  await db.update(rooms).set({ status: 'active' }).where(eq(rooms.id, scope.roomId));
  clock = new Date(base.getTime() + 60001);
  await sweepWaitlistAvailability(db, clock);
  const [event] = await db
    .select()
    .from(waitlistVacancyEvents)
    .where(eq(waitlistVacancyEvents.branchId, scope.branchId));
  if (!event) throw new Error('Vacancy event absent');
  const [page] = await db
    .select()
    .from(waitlistFanoutPages)
    .where(eq(waitlistFanoutPages.eventId, event.id));
  if (!page) throw new Error('Vacancy page absent');
  const [job] = await db
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.dedupeKey, 'waitlist.page:' + page.id));
  if (!job) throw new Error('Vacancy job absent');
  return { ...scope, event, page, job, db };
}
async function deliver(db: Database, row: typeof notificationOutbox.$inferSelect) {
  const leaseToken = randomUUID(),
    leaseExpiresAt = new Date(clock.getTime() + 60000);
  await db
    .update(notificationOutbox)
    .set({ leaseToken, leaseExpiresAt })
    .where(eq(notificationOutbox.id, row.id));
  const message = { ...row, leaseToken, leaseExpiresAt };
  const service = new NotificationService(new NotificationRepository(db, () => clock), () => clock);
  await service.deliver(message);
  return { service, message };
}
function targets(db: Database, eventId: string) {
  return db
    .select()
    .from(notificationOutbox)
    .where(
      and(
        eq(notificationOutbox.eventType, 'notification.create'),
        sql`${notificationOutbox.payload}->>'event' = 'waitlist.vacancy'`,
        sql`${notificationOutbox.payload}->>'operationId' = ${eventId}`,
      ),
    );
}
it('WAIT-001 / NTF-002: competing sweeps/fanout retries create exactly one notice per actual subscriber and no claim', async () => {
  const item = await prepare();
  await Promise.all([
    sweepWaitlistAvailability(item.db, clock),
    sweepWaitlistAvailability(item.db, clock),
  ]);
  expect(
    await item.db
      .select()
      .from(waitlistVacancyEvents)
      .where(eq(waitlistVacancyEvents.branchId, item.branchId)),
  ).toHaveLength(1);
  const { service, message } = await deliver(item.db, item.job);
  await service.deliver(message);
  const jobs = await targets(item.db, item.event.id);
  expect(jobs.map((job) => job.recipientUserId).sort()).toEqual([f.customerA, f.customerB].sort());
  for (const job of jobs) await deliver(item.db, job);
  expect(
    await item.db.select().from(notifications).where(eq(notifications.type, 'waitlist.vacancy')),
  ).toHaveLength(2);
  expect(
    await item.db
      .select()
      .from(inventoryClaims)
      .where(
        and(eq(inventoryClaims.branchId, item.branchId), isNull(inventoryClaims.assignmentId)),
      ),
  ).toHaveLength(0);
});
it('WAIT-001 / SEC-003: left entries, suspended accounts and post-event joins are excluded', async () => {
  const item = await prepare();
  await item.db
    .update(waitlistEntries)
    .set({ leftAt: clock })
    .where(
      and(
        eq(waitlistEntries.branchId, item.branchId),
        eq(waitlistEntries.customerUserId, f.customerA),
      ),
    );
  await item.db.update(users).set({ accountStatus: 'suspended' }).where(eq(users.id, f.customerB));
  await item.db.insert(waitlistEntries).values({
    id: randomUUID(),
    branchId: item.branchId,
    customerUserId: f.customerA,
    joinedAt: new Date(clock.getTime() + 1),
  });
  try {
    await deliver(item.db, item.job);
    expect(await targets(item.db, item.event.id)).toHaveLength(0);
  } finally {
    await item.db.update(users).set({ accountStatus: 'active' }).where(eq(users.id, f.customerB));
  }
});
it('WAIT-001: queue delay cannot alert customers after inventory becomes unavailable', async () => {
  const item = await prepare();
  await item.db.update(rooms).set({ status: 'inactive' }).where(eq(rooms.id, item.roomId));
  await deliver(item.db, item.job);
  expect(await targets(item.db, item.event.id)).toHaveLength(0);
});
it('WAIT-001: leaving after fanout still suppresses the final queued inbox notice', async () => {
  const item = await prepare();
  await deliver(item.db, item.job);
  const jobs = await targets(item.db, item.event.id),
    job = jobs.find((row) => row.recipientUserId === f.customerA);
  if (!job) throw new Error('Customer notice absent');
  await item.db
    .update(waitlistEntries)
    .set({ leftAt: clock })
    .where(
      and(
        eq(waitlistEntries.branchId, item.branchId),
        eq(waitlistEntries.customerUserId, f.customerA),
      ),
    );
  const before = await item.db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, f.customerA));
  await deliver(item.db, job);
  expect(
    await item.db.select().from(notifications).where(eq(notifications.userId, f.customerA)),
  ).toHaveLength(before.length);
  const [sent] = await item.db
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.id, job.id));
  expect(sent?.status).toBe('sent');
});
it('WAIT-001 / ACC-006: failed recipient enqueue rolls back fanout and lease acknowledgement for safe retry', async () => {
  const item = await prepare();
  await item.db.execute(
    sql`create function hsm_waitlist_failure() returns trigger language plpgsql as $$ begin if new.event_type = 'notification.create' and new.payload->>'event' = 'waitlist.vacancy' then raise exception 'fixture notice failure'; end if; return new; end $$`,
  );
  await item.db.execute(
    sql`create trigger hsm_waitlist_failure before insert on notification_outbox for each row execute function hsm_waitlist_failure()`,
  );
  try {
    await expect(deliver(item.db, item.job)).rejects.toThrow();
    expect(await targets(item.db, item.event.id)).toHaveLength(0);
    const [row] = await item.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.id, item.job.id));
    expect(row?.status).toBe('pending');
  } finally {
    await item.db.execute(sql`drop trigger hsm_waitlist_failure on notification_outbox`);
    await item.db.execute(sql`drop function hsm_waitlist_failure()`);
  }
  await deliver(item.db, item.job);
  expect(await targets(item.db, item.event.id)).toHaveLength(2);
});
