import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import {
  sweepVisitFollowUps,
  visitInterestResponses,
  visitRequests,
  visitingHours,
  notificationOutbox,
  notifications,
  visitLifecyclePayloadSchema,
} from '@hsm/db';
import { NotificationRepository, NotificationService } from '@hsm/notifications';
import { visitSummarySchema, visitInterestStateSchema } from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
// VISIT-001 / ACC-002/006: isolated Phase3 Docker acceptance recorded in STATUS.md (2026-10-24).
const base = new Date('2026-10-22T03:00:00Z');
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
function send(
  method: 'GET' | 'POST',
  url: string,
  payload?: unknown,
  token = f.customerAToken,
  key = randomUUID(),
) {
  return f.application.inject({
    method,
    url,
    headers: { authorization: 'Bearer ' + token, 'Idempotency-Key': key },
    ...(payload === undefined
      ? {}
      : {
          payload: JSON.stringify(payload),
          headers: {
            authorization: 'Bearer ' + token,
            'Idempotency-Key': key,
            'Content-Type': 'application/json',
          },
        }),
  });
}
async function completed() {
  const item = await f.inventory();
  await f.connection.db
    .insert(visitingHours)
    .values({ branchId: item.branchId, dayOfWeek: 4, opensAt: '09:00', closesAt: '17:00' });
  const requested = await send('POST', '/v1/me/visits', {
    branchId: item.branchId,
    requestedStart: '2026-10-22T04:00:00Z',
  });
  expect(requested.statusCode).toBe(201);
  const visit = visitSummarySchema.parse(requested.json()),
    url = '/v1/branches/' + item.branchId + '/visits/' + visit.id + '/actions';
  const approved = await send(
    'POST',
    url,
    { expectedUpdatedAt: visit.updatedAt, command: { action: 'approve' } },
    f.ownerToken,
  );
  expect(approved.statusCode).toBe(200);
  clock = new Date('2026-10-22T05:00:00Z');
  const result = await send(
    'POST',
    url,
    {
      expectedUpdatedAt: visitSummarySchema.parse(approved.json()).updatedAt,
      command: { action: 'complete' },
    },
    f.ownerToken,
  );
  expect(result.statusCode).toBe(200);
  return visitSummarySchema.parse(result.json());
}
function events(visitId: string) {
  return f.connection.db
    .select()
    .from(notificationOutbox)
    .where(
      and(
        eq(notificationOutbox.eventType, 'visit.lifecycle'),
        sql`${notificationOutbox.payload}->>'event' = 'visit.follow_up'`,
        sql`${notificationOutbox.payload}->>'visitId' = ${visitId}`,
      ),
    );
}
it('VISIT-001: competing daily sweeps persist one prompt and marker for an actual completed HTTP visit', async () => {
  const visit = await completed();
  const results = await Promise.all([
    sweepVisitFollowUps(f.connection.db, clock),
    sweepVisitFollowUps(f.connection.db, clock),
  ]);
  expect(results.reduce((sum, value) => sum + value, 0)).toBe(1);
  expect(await events(visit.id)).toHaveLength(1);
  expect(await sweepVisitFollowUps(f.connection.db, clock)).toBe(0);
  const [row] = await f.connection.db
    .select()
    .from(visitRequests)
    .where(eq(visitRequests.id, visit.id));
  expect(row?.followUpSentAt?.toISOString()).toBe(clock.toISOString());
});
it('VISIT-001: an explicit answer before the daily job suppresses the prompt and same-key retry appends once', async () => {
  const visit = await completed(),
    key = randomUUID(),
    url = '/v1/me/visits/' + visit.id + '/interest';
  const body = { expectedUpdatedAt: visit.updatedAt, stillInterested: false };
  const first = await send('POST', url, body, undefined, key),
    replay = await send('POST', url, body, undefined, key);
  expect(first.statusCode).toBe(200);
  expect(replay.statusCode).toBe(200);
  expect(replay.headers['idempotency-replayed']).toBe('true');
  expect(visitInterestStateSchema.parse(first.json()).stillInterested).toBe(false);
  expect(
    await f.connection.db
      .select()
      .from(visitInterestResponses)
      .where(eq(visitInterestResponses.visitId, visit.id)),
  ).toHaveLength(1);
  expect(await sweepVisitFollowUps(f.connection.db, clock)).toBe(0);
  expect(await events(visit.id)).toHaveLength(0);
});
it('VISIT-001 / SEC-003: foreign customers cannot respond; stale decisions fail; hostel access is read-only', async () => {
  const visit = await completed(),
    url = '/v1/me/visits/' + visit.id + '/interest';
  const body = { expectedUpdatedAt: visit.updatedAt, stillInterested: true };
  expect((await send('POST', url, body, f.customerBToken)).statusCode).toBe(404);
  const first = await send('POST', url, body);
  expect(first.statusCode).toBe(200);
  expect((await send('POST', url, { ...body, stillInterested: false })).statusCode).toBe(412);
  const branchUrl = '/v1/branches/' + visit.branchId + '/visits/' + visit.id + '/interest';
  const current = await send('GET', branchUrl, undefined, f.ownerToken);
  expect(current.statusCode).toBe(200);
  expect(visitInterestStateSchema.parse(current.json()).stillInterested).toBe(true);
  expect((await send('POST', branchUrl, body, f.ownerToken)).statusCode).toBe(404);
});
it('VISIT-001 / ACC-006: a failed required follow-up outbox write rolls back its one-shot marker', async () => {
  const visit = await completed();
  await f.connection.db.execute(
    sql`CREATE FUNCTION hsm_test_visit_follow_up_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type = 'visit.lifecycle' AND NEW.payload->>'event' = 'visit.follow_up' THEN RAISE EXCEPTION 'required visit follow-up write failed'; END IF; RETURN NEW; END $$`,
  );
  await f.connection.db.execute(
    sql`CREATE TRIGGER hsm_test_visit_follow_up_failure BEFORE INSERT ON notification_outbox FOR EACH ROW EXECUTE FUNCTION hsm_test_visit_follow_up_failure()`,
  );
  try {
    await expect(sweepVisitFollowUps(f.connection.db, clock)).rejects.toThrow();
    const [row] = await f.connection.db
      .select()
      .from(visitRequests)
      .where(eq(visitRequests.id, visit.id));
    expect(row?.followUpSentAt).toBeNull();
    expect(await events(visit.id)).toHaveLength(0);
  } finally {
    await f.connection.db.execute(
      sql`DROP TRIGGER hsm_test_visit_follow_up_failure ON notification_outbox`,
    );
    await f.connection.db.execute(sql`DROP FUNCTION hsm_test_visit_follow_up_failure()`);
  }
});

it('VISIT-001 / NTF-002: answering after fanout suppresses the final queued prompt', async () => {
  const visit = await completed(),
    db = f.connection.db;
  await sweepVisitFollowUps(db, clock);
  const [source] = await events(visit.id);
  if (!source) throw new Error('Follow-up source absent');
  const service = new NotificationService(new NotificationRepository(db, () => clock), () => clock);
  async function deliver(row: typeof notificationOutbox.$inferSelect) {
    const leaseToken = randomUUID(),
      leaseExpiresAt = new Date(clock.getTime() + 60000);
    await db
      .update(notificationOutbox)
      .set({ leaseToken, leaseExpiresAt })
      .where(eq(notificationOutbox.id, row.id));
    await service.deliver({ ...row, leaseToken, leaseExpiresAt });
  }
  await deliver(source);
  const payload = visitLifecyclePayloadSchema.parse(source.payload);
  const [noticeJob] = await db
    .select()
    .from(notificationOutbox)
    .where(
      and(
        eq(notificationOutbox.eventType, 'notification.create'),
        eq(notificationOutbox.recipientUserId, f.customerA),
        sql`${notificationOutbox.payload}->>'event' = 'visit.follow_up'`,
        sql`${notificationOutbox.payload}->>'operationId' = ${payload.historyId}`,
      ),
    );
  if (!noticeJob) throw new Error('Follow-up inbox job absent');
  expect(
    (
      await send('POST', '/v1/me/visits/' + visit.id + '/interest', {
        expectedUpdatedAt: visit.updatedAt,
        stillInterested: false,
      })
    ).statusCode,
  ).toBe(200);
  const before = await db.select().from(notifications).where(eq(notifications.userId, f.customerA));
  await deliver(noticeJob);
  expect(
    await db.select().from(notifications).where(eq(notifications.userId, f.customerA)),
  ).toHaveLength(before.length);
});
