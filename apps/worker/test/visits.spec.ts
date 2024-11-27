import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import pino from 'pino';
import {
  notificationOutbox,
  notifications,
  sweepVisitFollowUps,
  visitInterestResponses,
  visitRequests,
} from '@hsm/db';
import { NotificationRepository, NotificationService } from '@hsm/notifications';
import { OutboxRepository, type OutboxMessage } from '../src/repository.js';
import { startWorker } from '../src/runtime.js';
import { workerFixture } from './fixture.js';
import { completedVisit } from './visits.fixture.js';
let f: Awaited<ReturnType<typeof workerFixture>>;
beforeAll(async () => {
  f = await workerFixture();
});
afterAll(async () => {
  await f?.close();
});
function start(deliver: (row: OutboxMessage) => Promise<void>) {
  return startWorker(
    new OutboxRepository(f.database.db),
    {
      send: async () => {
        throw new Error('Unexpected external mail');
      },
    },
    randomBytes(32),
    f.redisUrl,
    pino({ level: 'silent' }),
    undefined,
    { deliver },
    undefined,
    undefined,
    { sweep: (now) => sweepVisitFollowUps(f.database.db, now) },
  );
}
it('VISIT-001 / NTF-002: real Redis restart retries a persisted follow-up and delivers one prompt to the exact Customer', async () => {
  const db = f.database.db,
    item = await completedVisit(db),
    notices = new NotificationService(new NotificationRepository(db));
  let worker = await start(async (row) => {
    if (row.eventType === 'visit.lifecycle') throw new Error('Recoverable visit fixture failure');
    await notices.deliver(row);
  });
  try {
    await expect
      .poll(
        async () => {
          const [row] = await db
            .select()
            .from(notificationOutbox)
            .where(eq(notificationOutbox.id, item.job.id));
          return row?.status;
        },
        { timeout: 15000, interval: 100 },
      )
      .toBe('failed');
    await worker.close();
    worker = await start((row) => notices.deliver(row));
    await expect
      .poll(
        async () =>
          (
            await db
              .select()
              .from(notifications)
              .where(
                and(
                  eq(notifications.userId, item.userId),
                  eq(notifications.type, 'visit.follow_up'),
                ),
              )
          ).length,
        { timeout: 15000, interval: 100 },
      )
      .toBe(1);
    const [source] = await db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.id, item.job.id));
    expect(source).toMatchObject({
      status: 'sent',
      attempts: 2,
      leaseToken: null,
      lastError: null,
    });
    const delivered = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, item.userId));
    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.data).toEqual({});
    expect(
      await db.select().from(notifications).where(eq(notifications.userId, item.ownerId)),
    ).toHaveLength(0);
    const [visit] = await db.select().from(visitRequests).where(eq(visitRequests.id, item.visitId));
    expect(visit?.followUpSentAt).not.toBeNull();
    expect(await sweepVisitFollowUps(db, new Date())).toBe(0);
  } finally {
    await worker.close();
  }
});
it('VISIT-001 / NTF-002: an answer after real worker fanout suppresses final inbox publication without repeating prompts', async () => {
  const db = f.database.db,
    item = await completedVisit(db),
    notices = new NotificationService(new NotificationRepository(db));
  const worker = await start(async (row) => {
    if (
      row.eventType === 'notification.create' &&
      row.payload.event === 'visit.follow_up' &&
      row.recipientUserId === item.userId
    )
      await db
        .insert(visitInterestResponses)
        .values({
          branchId: item.branchId,
          visitId: item.visitId,
          stillInterested: false,
          visitVersion: new Date(item.now.getTime() + 1),
        })
        .onConflictDoNothing();
    await notices.deliver(row);
  });
  try {
    await expect
      .poll(
        async () => {
          const [row] = await db
            .select()
            .from(notificationOutbox)
            .where(
              and(
                eq(notificationOutbox.eventType, 'notification.create'),
                eq(notificationOutbox.recipientUserId, item.userId),
                sql`${notificationOutbox.payload}->>'event' = 'visit.follow_up'`,
              ),
            );
          return row?.status;
        },
        { timeout: 15000, interval: 100 },
      )
      .toBe('sent');
    expect(
      await db
        .select()
        .from(visitInterestResponses)
        .where(eq(visitInterestResponses.visitId, item.visitId)),
    ).toHaveLength(1);
    expect(
      await db.select().from(notifications).where(eq(notifications.userId, item.userId)),
    ).toHaveLength(0);
    expect(await sweepVisitFollowUps(db, new Date())).toBe(0);
    expect(
      await db
        .select()
        .from(notificationOutbox)
        .where(
          and(
            eq(notificationOutbox.eventType, 'visit.lifecycle'),
            sql`${notificationOutbox.payload}->>'visitId' = ${item.visitId}`,
          ),
        ),
    ).toHaveLength(1);
  } finally {
    await worker.close();
  }
});
