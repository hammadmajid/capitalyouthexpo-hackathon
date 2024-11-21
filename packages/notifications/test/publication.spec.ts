import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { users, notificationOutbox, notifications } from '@hsm/db';
import {
  NotificationProducer,
  NotificationRepository,
  NotificationService,
  type NotificationMessage,
} from '../src/index.js';
import { notificationFixture } from './fixture.js';
let fixture: Awaited<ReturnType<typeof notificationFixture>>;
beforeAll(async () => {
  fixture = await notificationFixture();
});
afterAll(async () => {
  await fixture?.close();
});
const producer = new NotificationProducer();
function service() {
  return new NotificationService(new NotificationRepository(fixture.database.db));
}
async function pending() {
  const userId = randomUUID(),
    operationId = randomUUID();
  await fixture.database.db
    .insert(users)
    .values({ id: userId, fullName: 'Private notification fixture' });
  const event = { userId, operationId, event: 'account.email_verified' as const };
  await fixture.database.db.transaction(async (tx) => {
    await producer.enqueue(tx, event, new Date());
    await producer.enqueue(tx, event, new Date());
  });
  const rows = await fixture.database.db
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.recipientUserId, userId));
  expect(rows).toHaveLength(1);
  const row = rows[0];
  if (!row) throw new Error('Outbox fixture missing');
  const [lease] = await fixture.database.db
    .update(notificationOutbox)
    .set({
      attempts: 1,
      leaseToken: randomUUID(),
      leaseExpiresAt: new Date(Date.now() + 60000),
    })
    .where(eq(notificationOutbox.id, row.id))
    .returning();
  if (!lease) throw new Error('Claimed fixture missing');
  return { userId, lease };
}
async function inbox(userId: string) {
  return fixture.database.db.select().from(notifications).where(eq(notifications.userId, userId));
}
it('NTF-002: real recipient-bound production and concurrent delivery create one private notice and acknowledge atomically', async () => {
  const value = await pending();
  await Promise.all([service().deliver(value.lease), service().deliver(value.lease)]);
  await service().deliver(value.lease);
  const rows = await inbox(value.userId);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    userId: value.userId,
    type: 'account.email_verified',
    title: 'Email verified',
    body: 'Your email address has been verified.',
    data: {},
    deepLink: null,
    readAt: null,
  });
  const [job] = await fixture.database.db
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.id, value.lease.id));
  expect(job).toMatchObject({
    status: 'sent',
    leaseToken: null,
    leaseExpiresAt: null,
    lastError: null,
  });
});
it('NTF-002: producer failure rolls back the caller business mutation and outbox work together', async () => {
  const userId = randomUUID();
  await fixture.database.db
    .insert(users)
    .values({ id: userId, fullName: 'Original notification fixture' });
  await expect(
    fixture.database.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ fullName: 'Changed notification fixture' })
        .where(eq(users.id, userId));
      await producer.enqueue(
        tx,
        { userId, operationId: randomUUID(), event: 'account.password_changed' },
        new Date(),
      );
      throw new Error('Business transaction aborted');
    }),
  ).rejects.toThrow('Business transaction aborted');
  const [user] = await fixture.database.db.select().from(users).where(eq(users.id, userId));
  expect(user?.fullName).toBe('Original notification fixture');
  expect(
    await fixture.database.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.recipientUserId, userId)),
  ).toEqual([]);
});
it('NTF-002: actual acknowledgement failure rolls back the notification insert and preserves its retryable lease', async () => {
  const value = await pending();
  await fixture.database.db
    .execute(sql`CREATE FUNCTION fail_notification_ack() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.status = 'sent' THEN RAISE EXCEPTION 'fixture acknowledgement failure'; END IF; RETURN NEW; END $$`);
  await fixture.database.db
    .execute(sql`CREATE TRIGGER fail_notification_ack BEFORE UPDATE ON notification_outbox
    FOR EACH ROW EXECUTE FUNCTION fail_notification_ack()`);
  try {
    await expect(service().deliver(value.lease)).rejects.toThrow();
    expect(await inbox(value.userId)).toEqual([]);
    const [row] = await fixture.database.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.id, value.lease.id));
    expect(row).toMatchObject({ status: 'pending', leaseToken: value.lease.leaseToken });
  } finally {
    await fixture.database.db.execute(
      sql`DROP TRIGGER fail_notification_ack ON notification_outbox`,
    );
    await fixture.database.db.execute(sql`DROP FUNCTION fail_notification_ack()`);
  }
  await service().deliver(value.lease);
  expect(await inbox(value.userId)).toHaveLength(1);
});
it('NTF-002: replaced leases, changed recipients and expired database leases cannot publish stale notices', async () => {
  const value = await pending();
  await fixture.database.db
    .update(notificationOutbox)
    .set({ leaseToken: randomUUID() })
    .where(eq(notificationOutbox.id, value.lease.id));
  await service().deliver(value.lease);
  expect(await inbox(value.userId)).toEqual([]);
  await fixture.database.db
    .update(notificationOutbox)
    .set({
      leaseToken: value.lease.leaseToken,
      leaseExpiresAt: new Date(Date.now() - 1000),
    })
    .where(eq(notificationOutbox.id, value.lease.id));
  await service().deliver(value.lease);
  expect(await inbox(value.userId)).toEqual([]);
  const second = await pending();
  const foreign = await pending();
  const changed: NotificationMessage = { ...second.lease, recipientUserId: foreign.userId };
  await service().deliver(changed);
  expect(await inbox(second.userId)).toEqual([]);
  expect(await inbox(foreign.userId)).toEqual([]);
});
function signal() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve: () => resolve() };
}
it('NTF-002: real row-lock contention cannot extend a lease that expires before publication', async () => {
  const value = await pending(),
    locked = signal(),
    release = signal();
  const expiry = new Date(Date.now() + 3000);
  await fixture.database.db
    .update(notificationOutbox)
    .set({ leaseExpiresAt: expiry })
    .where(eq(notificationOutbox.id, value.lease.id));
  const lease = { ...value.lease, leaseExpiresAt: expiry };
  const held = fixture.database.db.transaction(async (tx) => {
    await tx
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.id, lease.id))
      .for('update');
    locked.resolve();
    await release.promise;
  });
  await locked.promise;
  const publication = service().deliver(lease);
  try {
    await expect
      .poll(
        async () => {
          const result = await fixture.database.db.execute<{
            count: number;
          }>(sql`SELECT count(*)::int AS count FROM pg_stat_activity
        WHERE wait_event_type = 'Lock' AND query LIKE '%notification_outbox%'`);
          return result[0]?.count ?? 0;
        },
        { timeout: 5000, interval: 20 },
      )
      .toBeGreaterThan(0);
    await delay(Math.max(0, expiry.getTime() - Date.now()) + 30);
  } finally {
    release.resolve();
    await held;
  }
  await publication;
  expect(await inbox(value.userId)).toEqual([]);
  const [row] = await fixture.database.db
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.id, lease.id));
  expect(row?.status).toBe('pending');
});
