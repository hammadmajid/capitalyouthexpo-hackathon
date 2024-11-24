import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { branches, idempotencyKeys, sessions, users } from '@hsm/db';
import { stayNoticeResultSchema } from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
import {
  ownNoticeFixture,
  sendOwnNotice,
  noticeRows,
  noticeInput,
  rejectNoticeDelivery,
  restoreNoticeDelivery,
} from './own-notice.fixture.js';
let f: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  f = await phaseTwoFixture(new Date('2026-10-04T10:00:00Z'));
});
afterAll(async () => {
  await f?.close();
});
it('OUT-001/006 / ACC-004: concurrent same-key real HTTP notice has one atomic result and retains occupancy and money', async () => {
  const item = await ownNoticeFixture(f),
    key = randomUUID(),
    before = await noticeRows(f, item);
  const responses = await Promise.all([sendOwnNotice(f, item, key), sendOwnNotice(f, item, key)]);
  expect(responses.map((row) => row.statusCode)).toEqual([201, 201]);
  expect(responses.map((row) => row.headers['idempotency-replayed']).sort()).toEqual([
    'false',
    'true',
  ]);
  expect(responses.map((row) => row.headers['cache-control'])).toEqual(['no-store', 'no-store']);
  const result = stayNoticeResultSchema.parse(responses[0]?.json());
  expect(stayNoticeResultSchema.parse(responses[1]?.json())).toEqual(result);
  expect(result).toMatchObject({
    stayId: item.stayId,
    state: 'notice_given',
    version: 2,
    plan: {
      submittedOn: '2026-10-04',
      requiredNoticeDays: 15,
      providedNoticeDays: 4,
      shortfallDays: 11,
      earliestCompliantCheckoutDate: '2026-10-19',
    },
  });
  const after = await noticeRows(f, item);
  expect(after.stay[0]).toMatchObject({ state: 'notice_given', version: 2 });
  for (const rows of [after.history, after.audit, after.events]) expect(rows).toHaveLength(1);
  expect(after.history[0]?.id).toBe(result.noticeId);
  expect(after.events[0]).toMatchObject({
    recipientUserId: item.userId,
    payload: { event: 'resident.notice_submitted', operationId: result.noticeId },
  });
  expect(after.assignments).toEqual(before.assignments);
  expect(after.claims).toEqual(before.claims);
  expect(after.ledger).toEqual(before.ledger);
});
it('ACC-004: distinct concurrent notice commands cannot duplicate the state transition', async () => {
  const item = await ownNoticeFixture(f);
  const responses = await Promise.all([sendOwnNotice(f, item), sendOwnNotice(f, item)]);
  expect(responses.map((row) => row.statusCode).sort()).toEqual([201, 409]);
  const rows = await noticeRows(f, item);
  for (const values of [rows.history, rows.audit, rows.events]) expect(values).toHaveLength(1);
});
it('SEC-003 / CHG-012: another Customer and the hostel Owner cannot submit an own notice for the linked resident', async () => {
  const item = await ownNoticeFixture(f),
    before = await noticeRows(f, item);
  for (const token of [f.customerAToken, f.ownerToken])
    expect((await sendOwnNotice(f, item, randomUUID(), token)).statusCode).toBe(404);
  expect(await noticeRows(f, item)).toEqual(before);
});
it('SEC-003: archived branch rejects a previously successful replay', async () => {
  const item = await ownNoticeFixture(f),
    key = randomUUID();
  expect((await sendOwnNotice(f, item, key)).statusCode).toBe(201);
  const before = await noticeRows(f, item);
  await f.connection.db
    .update(branches)
    .set({ archivedAt: f.now })
    .where(eq(branches.id, item.branchId));
  expect((await sendOwnNotice(f, item, key)).statusCode).toBe(403);
  expect(await noticeRows(f, item)).toEqual(before);
});
it('SEC-003: logout revocation rejects fresh and cached notice commands', async () => {
  const item = await ownNoticeFixture(f),
    key = randomUUID();
  expect((await sendOwnNotice(f, item, key)).statusCode).toBe(201);
  const before = await noticeRows(f, item);
  await f.connection.db
    .update(sessions)
    .set({ revokedAt: f.now, revokedReason: 'logout' })
    .where(eq(sessions.refreshTokenHash, f.crypto.digest(item.session.refreshToken, 'refresh')));
  expect((await sendOwnNotice(f, item, key)).statusCode).toBe(401);
  expect((await sendOwnNotice(f, item)).statusCode).toBe(401);
  expect(await noticeRows(f, item)).toEqual(before);
});
it('SEC-003: suspended linked identity loses replay access immediately', async () => {
  const item = await ownNoticeFixture(f),
    key = randomUUID();
  expect((await sendOwnNotice(f, item, key)).statusCode).toBe(201);
  const before = await noticeRows(f, item);
  await f.connection.db
    .update(users)
    .set({ accountStatus: 'suspended' })
    .where(eq(users.id, item.userId));
  expect((await sendOwnNotice(f, item, key)).statusCode).toBe(403);
  expect(await noticeRows(f, item)).toEqual(before);
});
it('OUT-001 / AUD-004: mandatory outbox failure rolls back state, history, audit and key; original command can safely retry', async () => {
  const item = await ownNoticeFixture(f),
    key = randomUUID(),
    before = await noticeRows(f, item);
  await rejectNoticeDelivery(f);
  try {
    expect((await sendOwnNotice(f, item, key)).statusCode).toBe(500);
    expect(await noticeRows(f, item)).toEqual(before);
    expect(
      await f.connection.db.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, key)),
    ).toEqual([]);
  } finally {
    await restoreNoticeDelivery(f);
  }
  expect((await sendOwnNotice(f, item, key)).statusCode).toBe(201);
  expect((await noticeRows(f, item)).events).toHaveLength(1);
});
it('OUT-001 / SEC-003: stale version and client-invented release instructions do not mutate the Stay', async () => {
  const item = await ownNoticeFixture(f),
    before = await noticeRows(f, item);
  expect(
    (
      await sendOwnNotice(f, item, randomUUID(), item.session.accessToken, {
        ...noticeInput,
        expectedVersion: 2,
      })
    ).statusCode,
  ).toBe(409);
  expect(
    (
      await sendOwnNotice(f, item, randomUUID(), item.session.accessToken, {
        ...noticeInput,
        releaseInventory: true,
      })
    ).statusCode,
  ).toBe(400);
  expect(await noticeRows(f, item)).toEqual(before);
});
