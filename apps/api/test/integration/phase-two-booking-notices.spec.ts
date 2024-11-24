import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  bookings,
  bookingHistory,
  inventoryClaims,
  notificationOutbox,
  notifications,
} from '@hsm/db';
import {
  bookingQuoteSnapshotSchema,
  bookingSummarySchema,
  holdResponseSchema,
} from '@hsm/contracts';
import { NotificationRepository, NotificationService } from '@hsm/notifications';
import { lockActor } from '../../src/auth/actor-lock.js';
import { BookingActionRepository } from '../../src/booking/actions.repository.js';
import { phaseTwoFixture } from './phase-two-fixture.js';
let fixture: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  fixture = await phaseTwoFixture(new Date('2026-10-15T10:00:00Z'));
});
afterAll(async () => {
  await fixture?.close();
});
const headers = (token: string, key = randomUUID()) => ({
  authorization: `Bearer ${token}`,
  'Idempotency-Key': key,
});
async function prepare() {
  const inventory = await fixture.inventory();
  const response = await fixture.application.inject({
    method: 'POST',
    url: `/v1/marketplace/${inventory.branchId}/quote`,
    payload: {
      target: { kind: 'bed', roomId: inventory.roomId, bedId: inventory.seatId },
      range: { moveInDate: '2026-11-01', moveOutDate: '2026-11-03' },
    },
  });
  expect(response.statusCode).toBe(200);
  const quote = bookingQuoteSnapshotSchema.parse(response.json());
  const held = await fixture.application.inject({
    method: 'POST',
    url: `/v1/marketplace/${inventory.branchId}/holds`,
    headers: headers(fixture.customerAToken),
    payload: { quote },
  });
  expect(held.statusCode).toBe(201);
  const hold = holdResponseSchema.parse(held.json()),
    key = randomUUID();
  const create = () =>
    fixture.application.inject({
      method: 'POST',
      url: `/v1/marketplace/${inventory.branchId}/bookings`,
      headers: headers(fixture.customerAToken, key),
      payload: { quote: hold.quote, holdId: hold.id, documents: [] },
    });
  const created = await create();
  expect(created.statusCode).toBe(201);
  return { booking: bookingSummarySchema.parse(created.json()), create };
}
function events(bookingId: string, kind = 'booking.lifecycle') {
  const field = kind === 'booking.lifecycle' ? 'bookingId' : 'operationId';
  return fixture.connection.db
    .select()
    .from(notificationOutbox)
    .where(
      and(
        eq(notificationOutbox.eventType, kind),
        sql`${notificationOutbox.payload} ->> ${field} = ${bookingId}`,
      ),
    );
}
async function lease(id: string) {
  const [row] = await fixture.connection.db
    .update(notificationOutbox)
    .set({
      leaseToken: randomUUID(),
      leaseExpiresAt: new Date(fixture.now.getTime() + 60000),
      attempts: 1,
    })
    .where(eq(notificationOutbox.id, id))
    .returning();
  if (!row) throw new Error('Outbox lease missing');
  return row;
}
const service = (clock: () => Date = () => fixture.now) =>
  new NotificationService(new NotificationRepository(fixture.connection.db, clock), clock);
function gate() {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    release = () => resolve();
  });
  return { promise, release: () => release() };
}
async function waitForRecipientWait() {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const rows = await fixture.connection.db.execute(
      sql`select count(*)::int as waiting from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid() and wait_event_type = 'Lock' and query ilike ${'%insert%notification_outbox%'}`,
    );
    const counts = z
      .array(z.object({ waiting: z.number().int().nonnegative() }).strict())
      .parse(rows);
    if ((counts[0]?.waiting ?? 0) > 0) return;
    await delay(20);
  }
  throw new Error('Recipient enqueue did not reach its controlled FK wait');
}
it('NTF-002 ACC-001/004: real booking replay, concurrent lifecycle handoff and inbox delivery remain private and deduplicated', async () => {
  const value = await prepare();
  const replay = await value.create();
  expect(replay.statusCode).toBe(201);
  expect(replay.headers['idempotency-replayed']).toBe('true');
  const source = await events(value.booking.id);
  expect(source.map((row) => row.payload.event).sort()).toEqual([
    'booking.confirmed',
    'booking.submitted',
  ]);
  expect(source.every((row) => row.recipientUserId === null)).toBe(true);
  const notices = service();
  for (const row of source) {
    const claimed = await lease(row.id);
    await Promise.all([notices.deliver(claimed), notices.deliver(claimed)]);
  }
  const jobs = await events(value.booking.id, 'notification.create');
  expect(jobs).toHaveLength(3);
  for (const row of jobs) {
    const claimed = await lease(row.id);
    await Promise.all([notices.deliver(claimed), notices.deliver(claimed)]);
  }
  const inbox = await fixture.connection.db
    .select()
    .from(notifications)
    .where(
      inArray(
        notifications.dedupeKey,
        jobs.map((row) => 'notification:' + row.id),
      ),
    );
  expect(inbox).toHaveLength(3);
  expect(
    inbox
      .filter((row) => row.userId === fixture.customerA)
      .map((row) => row.type)
      .sort(),
  ).toEqual(['booking.confirmed', 'booking.submitted']);
  expect(inbox.filter((row) => row.userId === fixture.ownerId).map((row) => row.type)).toEqual([
    'booking.received',
  ]);
  expect(inbox.some((row) => row.userId === fixture.customerB)).toBe(false);
  for (const notice of inbox) {
    expect(notice.data).toEqual({});
    expect(notice.deepLink).toBeNull();
    expect(notice.body).not.toContain(fixture.customerA);
  }
});
it('NTF-002 ACC-001: a real downstream cancellation failure rolls back booking, claims, history and its lifecycle event', async () => {
  const value = await prepare(),
    actor = await fixture.service.authenticate(fixture.customerAToken);
  const actions = new BookingActionRepository(
    fixture.connection.db,
    undefined,
    () => fixture.now,
    fixture.storage.bucket,
  );
  await expect(
    fixture.connection.db.transaction(async (transaction) => {
      await lockActor(transaction, actor, () => fixture.now);
      await actions.cancel(transaction, actor, value.booking.id, 'Controlled rollback fixture');
      throw new Error('Controlled rollback');
    }),
  ).rejects.toThrow('Controlled rollback');
  const [stored] = await fixture.connection.db
    .select({ state: bookings.state })
    .from(bookings)
    .where(eq(bookings.id, value.booking.id));
  expect(stored?.state).toBe('confirmed');
  const active = await fixture.connection.db
    .select({ id: inventoryClaims.id })
    .from(inventoryClaims)
    .where(
      and(eq(inventoryClaims.bookingId, value.booking.id), isNull(inventoryClaims.releasedAt)),
    );
  expect(active).toHaveLength(1);
  const history = await fixture.connection.db
    .select({ id: bookingHistory.id })
    .from(bookingHistory)
    .where(
      and(
        eq(bookingHistory.bookingId, value.booking.id),
        eq(bookingHistory.nextState, 'cancelled'),
      ),
    );
  expect(history).toHaveLength(0);
  expect(
    (await events(value.booking.id)).some((row) => row.payload.event === 'booking.cancelled'),
  ).toBe(false);
});
it('NTF-002: real recipient FK waiting cannot publish after lease expiry; fanout and source acknowledgement roll back together', async () => {
  const value = await prepare(),
    source = (await events(value.booking.id)).find(
      (row) => row.payload.event === 'booking.submitted',
    );
  if (!source) throw new Error('Lifecycle source missing');
  const claimed = await lease(source.id),
    actor = await fixture.service.authenticate(fixture.customerAToken);
  const acquired = gate(),
    release = gate();
  const identity = fixture.connection.db.transaction(async (transaction) => {
    await lockActor(transaction, actor, () => fixture.now);
    acquired.release();
    await release.promise;
  });
  await Promise.race([acquired.promise, identity]);
  let clock = fixture.now;
  const delivery = service(() => clock).deliver(claimed);
  try {
    await waitForRecipientWait();
    clock = new Date(fixture.now.getTime() + 60000);
    release.release();
    await expect(delivery).rejects.toThrow('lease expired');
    await identity;
    expect(await events(value.booking.id, 'notification.create')).toHaveLength(0);
    const [stored] = await fixture.connection.db
      .select({ status: notificationOutbox.status, leaseToken: notificationOutbox.leaseToken })
      .from(notificationOutbox)
      .where(eq(notificationOutbox.id, source.id));
    expect(stored).toMatchObject({ status: 'pending', leaseToken: claimed.leaseToken });
  } finally {
    release.release();
    await Promise.allSettled([identity, delivery]);
  }
});
