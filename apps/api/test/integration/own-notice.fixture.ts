import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import {
  users,
  stays,
  stayHistory,
  stayAssignments,
  inventoryClaims,
  residentLedger,
  hostelAuditLog,
  notificationOutbox,
} from '@hsm/db';
import { manualAdmissionResultSchema } from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
import { manualAdmissionFixture, admitResident } from './manual-admission.fixture.js';
type Fixture = Awaited<ReturnType<typeof phaseTwoFixture>>;
// OUT-001 / CHG-012: real linked account, deliberately without a CustomerProfile.
export async function ownNoticeFixture(f: Fixture) {
  const userId = randomUUID();
  await f.connection.db.insert(users).values({
    id: userId,
    fullName: 'Linked notice resident',
    email: userId + '@example.test',
    emailVerifiedAt: f.now,
  });
  const session = await f.service.issue(userId, 'mobile'),
    item = await manualAdmissionFixture(f, userId),
    admitted = await admitResident(f, item);
  if (admitted.statusCode !== 201) throw Error('Actual HTTP admission failed');
  const result = manualAdmissionResultSchema.parse(admitted.json());
  return { ...item, ...result, userId, session };
}
export type OwnNoticeFixture = Awaited<ReturnType<typeof ownNoticeFixture>>;
export const noticeInput = {
  expectedVersion: 1,
  requestedCheckoutDate: '2026-10-08',
  isEmergency: false,
};
export function sendOwnNotice(
  f: Fixture,
  item: OwnNoticeFixture,
  key = randomUUID(),
  token = item.session.accessToken,
  body: unknown = noticeInput,
) {
  return f.application.inject({
    method: 'POST',
    url: '/v1/me/stays/' + item.stayId + '/checkout-request',
    headers: {
      authorization: 'Bearer ' + token,
      'idempotency-key': key,
      'content-type': 'application/json',
    },
    payload: JSON.stringify(body),
  });
}
export async function noticeRows(f: Fixture, item: OwnNoticeFixture) {
  const db = f.connection.db;
  return {
    stay: await db.select().from(stays).where(eq(stays.id, item.stayId)),
    assignments: await db
      .select()
      .from(stayAssignments)
      .where(eq(stayAssignments.stayId, item.stayId)),
    claims: await db
      .select()
      .from(inventoryClaims)
      .where(eq(inventoryClaims.branchId, item.branchId)),
    ledger: await db.select().from(residentLedger).where(eq(residentLedger.stayId, item.stayId)),
    history: await db
      .select()
      .from(stayHistory)
      .where(
        and(eq(stayHistory.stayId, item.stayId), eq(stayHistory.reasonCode, 'notice_submitted')),
      ),
    audit: await db
      .select()
      .from(hostelAuditLog)
      .where(
        and(
          eq(hostelAuditLog.targetId, item.stayId),
          eq(hostelAuditLog.action, 'resident.notice.submitted'),
        ),
      ),
    events: await db
      .select()
      .from(notificationOutbox)
      .where(
        and(
          eq(notificationOutbox.recipientUserId, item.userId),
          sql`${notificationOutbox.payload}->>'event' = 'resident.notice_submitted'`,
        ),
      ),
  };
}
export async function rejectNoticeDelivery(f: Fixture) {
  await f.connection.db.execute(
    sql`create function hsm_test_notice_delivery_failure() returns trigger language plpgsql as $$ begin if NEW.payload->>'event' = 'resident.notice_submitted' then raise exception 'Fixture notice delivery failure' using errcode='P0001'; end if; return NEW; end; $$`,
  );
  await f.connection.db.execute(
    sql`create trigger hsm_test_notice_delivery_failure before insert on notification_outbox for each row execute function hsm_test_notice_delivery_failure()`,
  );
}
export async function restoreNoticeDelivery(f: Fixture) {
  await f.connection.db.execute(
    sql`drop trigger if exists hsm_test_notice_delivery_failure on notification_outbox`,
  );
  await f.connection.db.execute(sql`drop function if exists hsm_test_notice_delivery_failure()`);
}
