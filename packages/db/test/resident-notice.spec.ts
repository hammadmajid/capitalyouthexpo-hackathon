import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { v7 } from 'uuid';
import { DomainError } from '@hsm/contracts';
import {
  stays,
  stayHistory,
  stayAgreements,
  stayAssignments,
  inventoryClaims,
  hostelAuditLog,
  notificationOutbox,
  billingPolicies,
  organizations,
  branches,
  residentLedger,
} from '../src/index.js';
import {
  recordResidentNotice,
  type NoticeAuthorizer,
  type NoticePublisher,
} from '../src/resident-notice.js';
import { inventoryHarness } from './inventory.fixture.js';
import { financeScope, financeTime } from './resident-finance.fixture.js';
import { insertAssignment } from './stay-assignment.fixture.js';
const harness = inventoryHarness();
beforeAll(() => harness.start());
afterAll(() => harness.close());
// These fixtures exercise actual SQL command atomicity, not HTTP/session acceptance.
const authorize: NoticeAuthorizer = async (tx, scope) => {
  const [owner] = await tx
    .select({ id: organizations.id })
    .from(organizations)
    .innerJoin(branches, eq(branches.organizationId, organizations.id))
    .where(and(eq(branches.id, scope.branchId), eq(organizations.ownerUserId, scope.actorUserId)));
  if (!owner) throw new DomainError('BRANCH_FORBIDDEN', 403, 'Owner fixture scope unavailable');
};
const publish: NoticePublisher = async (tx, event, now) => {
  await tx.insert(notificationOutbox).values({
    eventType: 'notification.create',
    channel: 'in_app',
    recipientUserId: event.userId,
    payload: { event: 'resident.notice_submitted', operationId: event.noticeId },
    dedupeKey: 'notice-fixture:' + event.noticeId,
    createdAt: now,
    nextAttemptAt: now,
  });
};
async function prepare() {
  const f = await financeScope(harness),
    assignmentId = v7();
  await harness
    .database()
    .update(stays)
    .set({ state: 'active', checkedInAt: financeTime, version: 2 })
    .where(eq(stays.id, f.stayId));
  await insertAssignment(harness.database(), {
    id: assignmentId,
    branchId: f.branchId,
    stayId: f.stayId,
    roomTypeId: f.roomTypeId,
    roomId: f.roomId,
    seatId: f.seatId,
    seatOrdinal: 1,
    startedAt: financeTime,
    reason: 'Actual occupancy notice fixture',
    createdByUserId: f.ownerId,
  });
  const [claim] = await harness
    .database()
    .select()
    .from(inventoryClaims)
    .where(eq(inventoryClaims.assignmentId, assignmentId));
  if (!claim) throw Error('Actual occupancy fixture missing');
  return { ...f, assignmentId, claim };
}
function command(f: Awaited<ReturnType<typeof prepare>>) {
  return {
    scope: { branchId: f.branchId, stayId: f.stayId, actorUserId: f.ownerId, actorRole: 'owner' },
    notice: { expectedVersion: 2, requestedCheckoutDate: '2028-02-10', isEmergency: false },
  };
}
function run(value: unknown, delivery: NoticePublisher = publish) {
  return harness
    .database()
    .transaction((tx) => recordResidentNotice(tx, value, financeTime, authorize, delivery));
}
async function history(stayId: string) {
  return harness.database().select().from(stayHistory).where(eq(stayHistory.stayId, stayId));
}
async function expectOccupancyUnchanged(f: Awaited<ReturnType<typeof prepare>>) {
  expect(
    await harness
      .database()
      .select()
      .from(inventoryClaims)
      .where(eq(inventoryClaims.assignmentId, f.assignmentId)),
  ).toEqual([f.claim]);
  const [assignment] = await harness
    .database()
    .select()
    .from(stayAssignments)
    .where(eq(stayAssignments.id, f.assignmentId));
  expect(assignment?.endedAt).toBeNull();
}
it('OUT-001/006 / AUD-004: actual notice atomically records agreed shortfall/history/audit/delivery and preserves occupancy and ledger', async () => {
  const f = await prepare(),
    result = await run(command(f));
  expect(result).toMatchObject({
    state: 'notice_given',
    version: 3,
    plan: { requiredNoticeDays: 15, shortfallDays: 6 },
  });
  const rows = await history(f.stayId);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    id: result.noticeId,
    previousState: 'active',
    nextState: 'notice_given',
    detail: { agreementId: f.agreementId, requestedCheckoutDate: '2028-02-10', shortfallDays: 6 },
  });
  const audit = await harness
    .database()
    .select()
    .from(hostelAuditLog)
    .where(
      and(
        eq(hostelAuditLog.targetId, f.stayId),
        eq(hostelAuditLog.action, 'resident.notice.submitted'),
      ),
    );
  expect(audit).toHaveLength(1);
  const notices = await harness
    .database()
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.dedupeKey, 'notice-fixture:' + result.noticeId));
  expect(notices).toHaveLength(1);
  expect(notices[0]?.recipientUserId).toBe(f.customerA);
  expect(
    await harness
      .database()
      .select()
      .from(residentLedger)
      .where(eq(residentLedger.stayId, f.stayId)),
  ).toEqual([]);
  await expectOccupancyUnchanged(f);
});
it('ACC-001/004: actual competing notices create one history record and one state transition', async () => {
  const f = await prepare(),
    outcomes = await Promise.allSettled([run(command(f)), run(command(f))]);
  expect(outcomes.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
  expect(outcomes).toContainEqual(
    expect.objectContaining({
      status: 'rejected',
      reason: expect.objectContaining({ code: 'CONFLICT' }),
    }),
  );
  expect(await history(f.stayId)).toHaveLength(1);
  await expectOccupancyUnchanged(f);
});
it('NTF-002 / ACC-004: actual required delivery write/failure rolls back notice state/history/audit/outbox', async () => {
  const f = await prepare();
  let noticeId = '';
  await expect(
    run(command(f), async (tx, event, now) => {
      noticeId = event.noticeId;
      await publish(tx, event, now);
      throw Error('Fixture required notice failure');
    }),
  ).rejects.toThrow('Fixture required notice failure');
  const [stay] = await harness.database().select().from(stays).where(eq(stays.id, f.stayId));
  expect(stay).toMatchObject({ state: 'active', version: 2 });
  expect(await history(f.stayId)).toEqual([]);
  expect(
    await harness
      .database()
      .select()
      .from(hostelAuditLog)
      .where(eq(hostelAuditLog.targetId, f.stayId)),
  ).toEqual([]);
  expect(
    await harness
      .database()
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.dedupeKey, 'notice-fixture:' + noticeId)),
  ).toEqual([]);
  await expectOccupancyUnchanged(f);
  expect((await run(command(f))).state).toBe('notice_given');
});
it('SEC-003: actual foreign Stay under owned branch remains404 without history', async () => {
  const f = await prepare(),
    foreign = await prepare(),
    input = command(f);
  await expect(
    run({ ...input, scope: { ...input.scope, stayId: foreign.stayId } }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  expect(await history(f.stayId)).toEqual([]);
  expect(await history(foreign.stayId)).toEqual([]);
});
it('RENT-003 / OUT-001: future agreement terms cannot replace the currently effective notice requirement', async () => {
  const f = await prepare(),
    [original] = await harness
      .database()
      .select()
      .from(stayAgreements)
      .where(eq(stayAgreements.id, f.agreementId));
  if (!original) throw Error('Agreement missing');
  const policyId = v7(),
    policy = { ...(original.termsSnapshot.policy as Record<string, unknown>), noticeDays: 99 };
  await harness.database().insert(billingPolicies).values({
    id: policyId,
    branchId: f.branchId,
    isCurrent: false,
    policy,
    createdByUserId: f.ownerId,
  });
  await harness
    .database()
    .insert(stayAgreements)
    .values({
      ...original,
      id: v7(),
      version: 2,
      effectiveFrom: '2028-02-20',
      policyVersionId: policyId,
      termsSnapshot: { ...original.termsSnapshot, policyVersionId: policyId, policy },
    });
  expect((await run(command(f))).plan.requiredNoticeDays).toBe(15);
});
it('OUT-002: actual emergency notice retains reason and does not waive policy or release inventory', async () => {
  const f = await prepare(),
    input = command(f);
  const result = await run({
    ...input,
    notice: {
      ...input.notice,
      isEmergency: true,
      reason: 'Family emergency',
      requestedCheckoutDate: '2028-02-01',
    },
  });
  expect(result.plan).toMatchObject({ isEmergency: true, shortfallDays: 15 });
  expect((await history(f.stayId))[0]).toMatchObject({ detail: { reason: 'Family emergency' } });
  await expectOccupancyUnchanged(f);
});
it('AUD-004 / ACC-004: actual required notice audit failure rolls back state and append-only history', async () => {
  const f = await prepare();
  await harness
    .database()
    .execute(
      sql`create function hsm_test_notice_audit_failure() returns trigger language plpgsql as $$ begin if NEW.action = 'resident.notice.submitted' then raise exception 'Fixture notice audit failure' using errcode='P0001'; end if; return NEW; end; $$`,
    );
  await harness
    .database()
    .execute(
      sql`create trigger hsm_test_notice_audit_failure before insert on hostel_audit_log for each row execute function hsm_test_notice_audit_failure()`,
    );
  try {
    await expect(run(command(f))).rejects.toThrow();
    expect(await history(f.stayId)).toEqual([]);
    const [stay] = await harness.database().select().from(stays).where(eq(stays.id, f.stayId));
    expect(stay).toMatchObject({ state: 'active', version: 2 });
    await expectOccupancyUnchanged(f);
  } finally {
    await harness
      .database()
      .execute(sql`drop trigger if exists hsm_test_notice_audit_failure on hostel_audit_log`);
    await harness.database().execute(sql`drop function if exists hsm_test_notice_audit_failure()`);
  }
  expect((await run(command(f))).state).toBe('notice_given');
});
