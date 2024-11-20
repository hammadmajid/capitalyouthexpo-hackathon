import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import {
  residentBillingSchedules,
  notificationOutbox,
  hostelAuditLog,
  residentCharges,
} from '../src/index.js';
import { authorizeResidentBilling } from '../src/resident-billing-authorize.js';
import { inventoryHarness } from './inventory.fixture.js';
import { financeScope } from './resident-finance.fixture.js';
import { expectBillingGuard } from './resident-billing-assertions.fixture.js';
const harness = inventoryHarness();
beforeAll(() => harness.start());
afterAll(() => harness.close());
function command(f: Awaited<ReturnType<typeof financeScope>>) {
  return {
    organizationId: f.organizationId,
    branchId: f.branchId,
    stayId: f.stayId,
    agreementId: f.agreementId,
    actorUserId: f.ownerId,
    actorRole: 'owner',
    dispatch: 'immediate',
    item: 'rent',
    cadence: 'periodic',
    periodIndex: 0,
  };
}
it('RENT-004 / AUD-004: real initial scheduling commits exactly one human audit, pending job and scoped schedule without a financial mutation', async () => {
  const f = await financeScope(harness),
    now = new Date();
  const result = await harness
    .database()
    .transaction((tx) => authorizeResidentBilling(tx, command(f), now));
  const [schedule] = await harness
    .database()
    .select()
    .from(residentBillingSchedules)
    .where(eq(residentBillingSchedules.id, result.id));
  expect(schedule).toMatchObject({
    authorizedByUserId: f.ownerId,
    state: 'active',
    version: 1,
    periodIndex: 0n,
    currentJobId: result.currentJobId,
    nextRunAt: now,
  });
  await expectAuthorization(f, result.id, result.currentJobId);
});
it('ACC-004: real concurrent initial authorizations commit one schedule/job/audit and roll back duplicate attempts', async () => {
  const f = await financeScope(harness);
  const results = await Promise.allSettled(
    Array.from({ length: 6 }, () =>
      harness.database().transaction((tx) => authorizeResidentBilling(tx, command(f), new Date())),
    ),
  );
  expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((row) => row.status === 'rejected')).toHaveLength(5);
  const schedules = await harness
    .database()
    .select()
    .from(residentBillingSchedules)
    .where(eq(residentBillingSchedules.stayId, f.stayId));
  expect(schedules).toHaveLength(1);
  const audits = await harness
    .database()
    .select()
    .from(hostelAuditLog)
    .where(
      and(
        eq(hostelAuditLog.branchId, f.branchId),
        eq(hostelAuditLog.action, 'billing.schedule.authorized'),
      ),
    );
  expect(audits).toHaveLength(1);
  const schedule = schedules[0];
  if (!schedule) throw new Error('Schedule missing');
  const jobs = await harness
    .database()
    .select()
    .from(notificationOutbox)
    .where(sql`${notificationOutbox.payload}->>'scheduleId'=${schedule.id}`);
  expect(jobs).toHaveLength(1);
});
it('AUD-004 / ACC-004: actual required authorization audit rejection leaves no schedule or job', async () => {
  const f = await financeScope(harness);
  await harness
    .database()
    .execute(
      sql`create function hsm_test_authorization_failure() returns trigger language plpgsql as $$ begin if NEW.action = 'billing.schedule.authorized' then raise exception 'Fixture authorization audit failure' using errcode='23514'; end if; return NEW; end; $$`,
    );
  try {
    await harness
      .database()
      .execute(
        sql`create trigger hsm_test_authorization_failure before insert on hostel_audit_log for each row execute function hsm_test_authorization_failure()`,
      );
    await expectBillingGuard(
      harness.database().transaction((tx) => authorizeResidentBilling(tx, command(f), new Date())),
      'Fixture authorization audit failure',
    );
    expect(
      await harness
        .database()
        .select()
        .from(residentBillingSchedules)
        .where(eq(residentBillingSchedules.stayId, f.stayId)),
    ).toEqual([]);
  } finally {
    await harness
      .database()
      .execute(sql`drop trigger if exists hsm_test_authorization_failure on hostel_audit_log`);
    await harness.database().execute(sql`drop function hsm_test_authorization_failure()`);
  }
});

async function expectAuthorization(
  f: Awaited<ReturnType<typeof financeScope>>,
  scheduleId: string,
  jobId: string | null,
) {
  const [audit] = await harness
    .database()
    .select()
    .from(hostelAuditLog)
    .where(
      and(
        eq(hostelAuditLog.branchId, f.branchId),
        eq(hostelAuditLog.action, 'billing.schedule.authorized'),
      ),
    );
  expect(audit).toMatchObject({
    actorUserId: f.ownerId,
    actorRole: 'owner',
    targetId: scheduleId,
    after: { agreementId: f.agreementId, item: 'rent', cadence: 'periodic', periodIndex: 0 },
  });
  const jobs = await harness
    .database()
    .select()
    .from(notificationOutbox)
    .where(sql`${notificationOutbox.payload}->>'scheduleId'=${scheduleId}`);
  expect(jobs).toHaveLength(1);
  expect(jobs[0]).toMatchObject({
    id: jobId,
    status: 'pending',
    leaseToken: null,
    payload: { scheduleId: scheduleId, version: 1, periodIndex: 0 },
  });
  expect(
    await harness
      .database()
      .select()
      .from(residentCharges)
      .where(eq(residentCharges.stayId, f.stayId)),
  ).toEqual([]);
}
