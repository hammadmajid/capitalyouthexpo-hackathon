import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  idempotencyKeys,
  managerAssignments,
  notificationOutbox,
  visitHistory,
  visitRequests,
  visitingHours,
} from '@hsm/db';
import { NotificationRepository, NotificationService } from '@hsm/notifications';
import {
  visitSummarySchema,
  visitHistoryPageSchema,
  visitingHoursStateSchema,
} from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
// VISIT-001 / ACC-002/003/006: IMPLEMENTED — NOT RUN — DEFERRED TO PHASE 10.
let f: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  f = await phaseTwoFixture(new Date('2026-10-22T03:00:00Z'));
});
afterAll(async () => {
  await f?.close();
});
const start = '2026-11-05T05:00:00.000Z';
async function prepare() {
  const item = await f.inventory();
  await f.connection.db
    .insert(visitingHours)
    .values({ branchId: item.branchId, dayOfWeek: 4, opensAt: '09:00', closesAt: '17:00' });
  return item;
}
function send(
  method: 'GET' | 'POST' | 'PUT',
  url: string,
  body?: unknown,
  token?: string,
  key = randomUUID(),
) {
  return f.application.inject({
    method,
    url,
    headers: {
      Authorization: 'Bearer ' + (token ?? f.customerAToken),
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
  });
}
async function request(branchId: string) {
  const response = await send('POST', '/v1/me/visits', { branchId, requestedStart: start });
  expect(response.statusCode).toBe(201);
  return visitSummarySchema.parse(response.json());
}
it('VISIT-001: same-key real HTTP concurrency records one request, history and durable event', async () => {
  const item = await prepare(),
    key = randomUUID(),
    input = { branchId: item.branchId, requestedStart: start };
  const results = await Promise.all([
    send('POST', '/v1/me/visits', input, undefined, key),
    send('POST', '/v1/me/visits', input, undefined, key),
  ]);
  expect(results.map((value) => value.statusCode)).toEqual([201, 201]);
  expect(results.map((value) => value.headers['idempotency-replayed']).sort()).toEqual([
    'false',
    'true',
  ]);
  const visit = visitSummarySchema.parse(results[0]?.json());
  expect(results[1]?.json()).toEqual(visit);
  const rows = await f.connection.db
    .select()
    .from(visitHistory)
    .where(eq(visitHistory.visitId, visit.id));
  expect(rows).toHaveLength(1);
  expect(
    await f.connection.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.dedupeKey, 'visit.lifecycle:' + rows[0]?.id)),
  ).toHaveLength(1);
});
it('VISIT-001: distinct concurrent requests cannot duplicate an active customer time', async () => {
  const item = await prepare(),
    input = { branchId: item.branchId, requestedStart: start };
  const results = await Promise.all([
    send('POST', '/v1/me/visits', input),
    send('POST', '/v1/me/visits', input),
  ]);
  expect(results.map((value) => value.statusCode).sort()).toEqual([201, 409]);
  expect(
    await f.connection.db
      .select()
      .from(visitRequests)
      .where(eq(visitRequests.branchId, item.branchId)),
  ).toHaveLength(1);
});
it('VISIT-001 / ACC-003: another customer cannot cancel a private visit', async () => {
  const item = await prepare(),
    visit = await request(item.branchId);
  const result = await send(
    'POST',
    '/v1/me/visits/' + visit.id + '/actions',
    { expectedUpdatedAt: visit.updatedAt, command: { action: 'cancel' } },
    f.customerBToken,
  );
  expect(result.statusCode).toBe(404);
  const rows = await f.connection.db
    .select()
    .from(visitRequests)
    .where(eq(visitRequests.id, visit.id));
  expect(rows[0]?.status).toBe('requested');
});
it('VISIT-001 / ACC-002: a real assigned Manager is denied another branch and suspension immediately removes access', async () => {
  const allowed = await prepare(),
    foreign = await prepare(),
    assignmentId = randomUUID();
  await f.connection.db.insert(managerAssignments).values({
    id: assignmentId,
    branchId: allowed.branchId,
    userId: f.customerB,
    appointedByUserId: f.ownerId,
    status: 'active',
    activatedAt: f.now,
  });
  const managerSession = await f.service.issue(f.customerB, 'mobile');
  expect(
    (
      await send(
        'GET',
        '/v1/branches/' + allowed.branchId + '/visits',
        undefined,
        managerSession.accessToken,
      )
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await send(
        'GET',
        '/v1/branches/' + foreign.branchId + '/visits',
        undefined,
        managerSession.accessToken,
      )
    ).statusCode,
  ).toBe(403);
  await f.connection.db
    .update(managerAssignments)
    .set({ status: 'suspended' })
    .where(eq(managerAssignments.id, assignmentId));
  expect([401, 403]).toContain(
    (
      await send(
        'GET',
        '/v1/branches/' + allowed.branchId + '/visits',
        undefined,
        managerSession.accessToken,
      )
    ).statusCode,
  );
});
it('VISIT-001: stale acceptance cannot silently accept a replaced proposal', async () => {
  const item = await prepare(),
    visit = await request(item.branchId),
    url = '/v1/branches/' + item.branchId + '/visits/' + visit.id + '/actions';
  const first = await send(
    'POST',
    url,
    {
      expectedUpdatedAt: visit.updatedAt,
      command: { action: 'reschedule', proposedStart: '2026-11-05T06:00:00Z' },
    },
    f.ownerToken,
  );
  expect(first.statusCode).toBe(200);
  const proposal = visitSummarySchema.parse(first.json());
  const second = await send(
    'POST',
    url,
    {
      expectedUpdatedAt: proposal.updatedAt,
      command: { action: 'reschedule', proposedStart: '2026-11-05T07:00:00Z' },
    },
    f.ownerToken,
  );
  expect(second.statusCode).toBe(200);
  const replacement = visitSummarySchema.parse(second.json());
  const own = '/v1/me/visits/' + visit.id + '/actions';
  expect(
    (
      await send('POST', own, {
        expectedUpdatedAt: proposal.updatedAt,
        command: { action: 'accept-reschedule' },
      })
    ).statusCode,
  ).toBe(412);
  const accepted = await send('POST', own, {
    expectedUpdatedAt: replacement.updatedAt,
    command: { action: 'accept-reschedule' },
  });
  expect(accepted.statusCode).toBe(200);
  expect(visitSummarySchema.parse(accepted.json()).requestedStart).toBe('2026-11-05T07:00:00.000Z');
  const history = await f.connection.db
    .select()
    .from(visitHistory)
    .where(eq(visitHistory.visitId, visit.id))
    .orderBy(visitHistory.id);
  expect(history).toHaveLength(4);
  expect(history[0]?.requestedStart.toISOString()).toBe(start);
});
it('VISIT-001: changed hours reject an obsolete request without writing a visit', async () => {
  const item = await prepare(),
    url = '/v1/branches/' + item.branchId + '/visiting-hours';
  const current = await send('GET', url, undefined, f.ownerToken);
  expect(current.statusCode).toBe(200);
  const version = visitingHoursStateSchema.parse(current.json()).version;
  expect(
    (
      await send(
        'PUT',
        url,
        {
          expectedVersion: version,
          windows: [{ dayOfWeek: 4, opensAt: '11:00', closesAt: '12:00' }],
        },
        f.ownerToken,
      )
    ).statusCode,
  ).toBe(200);
  expect(
    (await send('POST', '/v1/me/visits', { branchId: item.branchId, requestedStart: start }))
      .statusCode,
  ).toBe(422);
  expect(
    await f.connection.db
      .select()
      .from(visitRequests)
      .where(eq(visitRequests.branchId, item.branchId)),
  ).toHaveLength(0);
});
it('VISIT-001 / ACC-006: required outbox failure rolls back visit, history and command acknowledgement', async () => {
  const item = await prepare(),
    key = randomUUID();
  await f.connection.db.execute(
    sql`create function hsm_test_visit_failure() returns trigger language plpgsql as $$ begin if NEW.event_type = 'visit.lifecycle' then raise exception 'Visit event fixture rejection'; end if; return NEW; end; $$`,
  );
  await f.connection.db.execute(
    sql`create trigger hsm_test_visit_failure before insert on notification_outbox for each row execute function hsm_test_visit_failure()`,
  );
  try {
    expect(
      (
        await send(
          'POST',
          '/v1/me/visits',
          { branchId: item.branchId, requestedStart: start },
          undefined,
          key,
        )
      ).statusCode,
    ).toBe(500);
    expect(
      await f.connection.db
        .select()
        .from(visitRequests)
        .where(eq(visitRequests.branchId, item.branchId)),
    ).toHaveLength(0);
    expect(
      await f.connection.db
        .select()
        .from(visitHistory)
        .where(eq(visitHistory.branchId, item.branchId)),
    ).toHaveLength(0);
    expect(
      await f.connection.db
        .select()
        .from(idempotencyKeys)
        .where(and(eq(idempotencyKeys.key, key), eq(idempotencyKeys.userId, f.customerA))),
    ).toHaveLength(0);
  } finally {
    await f.connection.db.execute(sql`drop trigger hsm_test_visit_failure on notification_outbox`);
    await f.connection.db.execute(sql`drop function hsm_test_visit_failure()`);
  }
});
it('VISIT-001 / NTF-002: real history resolves only source-bound recipients and acknowledges the lease', async () => {
  const item = await prepare(),
    visit = await request(item.branchId),
    db = f.connection.db;
  const [history] = await db.select().from(visitHistory).where(eq(visitHistory.visitId, visit.id));
  if (!history) throw Error('Visit source history unavailable');
  const [event] = await db
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.dedupeKey, 'visit.lifecycle:' + history.id));
  if (!event) throw Error('Visit event unavailable');
  const leaseToken = randomUUID(),
    leaseExpiresAt = new Date(f.now.getTime() + 60000);
  await db
    .update(notificationOutbox)
    .set({ leaseToken, leaseExpiresAt })
    .where(eq(notificationOutbox.id, event.id));
  await new NotificationService(new NotificationRepository(db, () => f.now), () => f.now).deliver({
    ...event,
    leaseToken,
    leaseExpiresAt,
  });
  const expected = [f.customerA, f.ownerId].map(
    (id) => 'in_app:' + id + ':visit.changed:' + history.id,
  );
  const jobs = await db
    .select()
    .from(notificationOutbox)
    .where(inArray(notificationOutbox.dedupeKey, expected));
  expect(jobs).toHaveLength(2);
  expect(jobs.map((row) => row.recipientUserId).sort()).toEqual([f.customerA, f.ownerId].sort());
  const [completed] = await db
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.id, event.id));
  expect(completed?.status).toBe('sent');
});

it('VISIT-001 / SEC-003: real visit history rejects a foreign customer and retains original snapshot', async () => {
  const item = await prepare(),
    visit = await request(item.branchId);
  const url = '/v1/me/visits/' + visit.id + '/history';
  const denied = await send('GET', url, undefined, f.customerBToken);
  expect(denied.statusCode).toBe(404);
  const response = await send('GET', url);
  expect(response.statusCode).toBe(200);
  const page = visitHistoryPageSchema.parse(response.json());
  expect(page.visitId).toBe(visit.id);
  expect(page.data).toHaveLength(1);
  expect(page.data[0]?.action).toBe('request');
  expect(page.data[0]?.requestedStart).toBe(start);
  expect(page.data[0]).not.toHaveProperty('actorUserId');
});

it('VISIT-001 / ACC-003: accepting a colliding proposed time returns409 and retains both visits and immutable history', async () => {
  const item = await prepare(),
    visit = await request(item.branchId),
    proposedStart = '2026-11-05T06:00:00.000Z';
  const other = await send('POST', '/v1/me/visits', {
    branchId: item.branchId,
    requestedStart: proposedStart,
  });
  expect(other.statusCode).toBe(201);
  const proposal = await send(
    'POST',
    '/v1/branches/' + item.branchId + '/visits/' + visit.id + '/actions',
    {
      expectedUpdatedAt: visit.updatedAt,
      command: { action: 'reschedule', proposedStart },
    },
    f.ownerToken,
  );
  expect(proposal.statusCode).toBe(200);
  const before = visitSummarySchema.parse(proposal.json());
  const rejected = await send('POST', '/v1/me/visits/' + visit.id + '/actions', {
    expectedUpdatedAt: before.updatedAt,
    command: { action: 'accept-reschedule' },
  });
  expect(rejected.statusCode).toBe(409);
  const [stored] = await f.connection.db
    .select()
    .from(visitRequests)
    .where(eq(visitRequests.id, visit.id));
  expect(stored?.status).toBe('rescheduled');
  expect(stored?.updatedAt.toISOString()).toBe(before.updatedAt);
  const history = await f.connection.db
    .select()
    .from(visitHistory)
    .where(eq(visitHistory.visitId, visit.id));
  expect(history).toHaveLength(2);
  const branchVisits = await f.connection.db
    .select({ id: visitRequests.id })
    .from(visitRequests)
    .where(eq(visitRequests.branchId, item.branchId));
  expect(branchVisits).toHaveLength(2);
});
