import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq, inArray, sql } from 'drizzle-orm';
import { notifications, notificationOutbox, residents, stays } from '@hsm/db';
import { InvalidNotificationJob, NotificationRepository } from '../src/index.js';
import { notificationFixture } from './fixture.js';
import {
  residentPublicationScope as scope,
  claimResidentPublication as claim,
  residentPublicationService as service,
  residentChildJobs as children,
  deliverResidentChild as deliverChild,
} from './resident-publication.fixture.js';
let fixture: Awaited<ReturnType<typeof notificationFixture>>;
beforeAll(async () => {
  fixture = await notificationFixture();
});
afterAll(async () => {
  await fixture?.close();
});
it('NTF-002 / ACC-004: actual admission source, concurrent fanout, child delivery and immutable safe inbox notices remain exactly once', async () => {
  const db = fixture.database.db,
    f = await scope(db, true),
    lease = await claim(db, f.stayId, f.now),
    repo = new NotificationRepository(db, () => f.now);
  const results = await Promise.all([
    repo.publishResident(lease, f.now),
    repo.publishResident(lease, f.now),
  ]);
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(await repo.publishResident(lease, f.now)).toBe(false);
  const jobs = await children(db, lease.payload.historyId);
  expect(jobs).toHaveLength(2);
  expect(new Set(jobs.map((row) => row.recipientUserId))).toEqual(new Set([f.owner, f.user]));
  for (const row of jobs) await deliverChild(db, row, f.now);
  const inbox = await db
    .select()
    .from(notifications)
    .where(inArray(notifications.userId, [f.owner, f.user]));
  expect(inbox).toHaveLength(2);
  expect(new Set(inbox.map((row) => row.type))).toEqual(
    new Set(['resident.admission_recorded', 'resident.stay_started']),
  );
  for (const row of inbox) {
    expect(row.data).toEqual({});
    expect(row.deepLink).toBeNull();
    expect(row.body).not.toContain('Private resident fixture');
  }
  expect(
    (await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, lease.id)))[0],
  ).toMatchObject({ status: 'sent', leaseToken: null, leaseExpiresAt: null });
});
it('RES-003 / NTF-002: actual offline admission publishes only to its real owning account without a fake resident recipient', async () => {
  const db = fixture.database.db,
    f = await scope(db, false),
    lease = await claim(db, f.stayId, f.now);
  await service(db, f.now).deliver(lease);
  const jobs = await children(db, lease.payload.historyId);
  expect(jobs).toHaveLength(1);
  expect(jobs[0]).toMatchObject({
    recipientUserId: f.owner,
    payload: { event: 'resident.admission_recorded', operationId: lease.payload.historyId },
  });
});
it('RES-003 / SEC-003: later explicit account linkage cannot retroactively add a recipient to an offline admission event', async () => {
  const db = fixture.database.db,
    f = await scope(db, false),
    lease = await claim(db, f.stayId, f.now);
  // Fixture simulates verified later linkage; not the linking workflow's acceptance.
  await db.transaction(async (tx) => {
    await tx.update(residents).set({ userId: f.user }).where(eq(residents.id, f.residentId));
    await tx
      .update(stays)
      .set({ userId: f.user, version: 2, updatedAt: f.now })
      .where(eq(stays.id, f.stayId));
  });
  await service(db, f.now).deliver(lease);
  const jobs = await children(db, lease.payload.historyId);
  expect(jobs).toHaveLength(1);
  expect(jobs[0]?.recipientUserId).toBe(f.owner);
});
it('SEC-003 / NTF-002: an actual foreign admission history cannot validate another Stay lifecycle event', async () => {
  const db = fixture.database.db,
    first = await scope(db, true),
    second = await scope(db, true),
    original = await claim(db, first.stayId, first.now),
    other = await claim(db, second.stayId, second.now);
  const payload = { ...original.payload, historyId: other.payload.historyId };
  await db
    .update(notificationOutbox)
    .set({ payload })
    .where(eq(notificationOutbox.id, original.id));
  await expect(service(db, first.now).deliver({ ...original, payload })).rejects.toBeInstanceOf(
    InvalidNotificationJob,
  );
  expect(await children(db, original.payload.historyId)).toEqual([]);
  expect(await children(db, other.payload.historyId)).toEqual([]);
  expect(
    (await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, original.id)))[0]
      ?.status,
  ).toBe('pending');
});
it('NTF-002 / ACC-004: actual required child fanout failure rolls back jobs and source acknowledgement, then the same lease retries once', async () => {
  const db = fixture.database.db,
    f = await scope(db, true),
    lease = await claim(db, f.stayId, f.now);
  await db.execute(
    sql`create function hsm_test_resident_fanout_failure() returns trigger language plpgsql as $$ begin if NEW.event_type = 'notification.create' then raise exception 'Fixture resident fanout failure' using errcode='P0001'; end if; return NEW; end; $$`,
  );
  await db.execute(
    sql`create trigger hsm_test_resident_fanout_failure before insert on notification_outbox for each row execute function hsm_test_resident_fanout_failure()`,
  );
  try {
    await expect(service(db, f.now).deliver(lease)).rejects.toThrow();
    expect(await children(db, lease.payload.historyId)).toEqual([]);
    expect(
      (await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, lease.id)))[0],
    ).toMatchObject({ status: 'pending', leaseToken: lease.leaseToken });
  } finally {
    await db.execute(
      sql`drop trigger if exists hsm_test_resident_fanout_failure on notification_outbox`,
    );
    await db.execute(sql`drop function if exists hsm_test_resident_fanout_failure()`);
  }
  await service(db, f.now).deliver(lease);
  expect(await children(db, lease.payload.historyId)).toHaveLength(2);
  await service(db, f.now).deliver(lease);
  expect(await children(db, lease.payload.historyId)).toHaveLength(2);
});
it('NTF-002: an actual expired persisted admission lease cannot create recipient jobs or acknowledge delivery', async () => {
  const db = fixture.database.db,
    f = await scope(db, true),
    lease = await claim(db, f.stayId, f.now);
  await db
    .update(notificationOutbox)
    .set({ leaseExpiresAt: f.now })
    .where(eq(notificationOutbox.id, lease.id));
  await service(db, f.now).deliver({ ...lease, leaseExpiresAt: f.now });
  expect(await children(db, lease.payload.historyId)).toEqual([]);
  expect(
    (await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, lease.id)))[0]
      ?.status,
  ).toBe('pending');
});
