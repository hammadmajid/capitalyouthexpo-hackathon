import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import {
  notificationOutbox,
  residentBillingSchedules,
  residentInvoices,
  residentBillingExecutions,
  hostelAuditLog,
  branches,
  recoverResidentBilling,
  deliverResidentBilling,
} from '@hsm/db';
import { OutboxRepository } from '../src/repository.js';
import { workerFixture } from './fixture.js';
import { stoppedBillingFixture } from './billing.fixture.js';
let f: Awaited<ReturnType<typeof workerFixture>>;
beforeAll(async () => {
  f = await workerFixture();
});
afterAll(async () => {
  await f?.close();
});
const now = new Date(Date.now() - 30 * 60_000);
async function exhausted(active = true) {
  const item = await stoppedBillingFixture(f.database.db, active);
  const repo = new OutboxRepository(f.database.db);
  let at = active ? now : new Date();
  for (let attempt = 1; attempt <= 5; attempt++) {
    const claimed = await repo.claim(item.jobId, at);
    expect(claimed?.attempts).toBe(attempt);
    if (!claimed) throw new Error('Missing fixture lease');
    await repo.failed(claimed, 'DELIVERY_FAILED', at);
    at = new Date(at.getTime() + 300_001);
  }
  const [dead] = await f.database.db
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.id, item.jobId));
  const [schedule] = await f.database.db
    .select()
    .from(residentBillingSchedules)
    .where(eq(residentBillingSchedules.id, item.scheduleId));
  expect(dead).toMatchObject({ status: 'dead', attempts: 5, leaseToken: null });
  expect(schedule).toMatchObject({ state: active ? 'active' : 'stopped', periodIndex: 0n });
  expect(await new OutboxRepository(f.database.db).claim(item.jobId, at)).toBeUndefined();
  return {
    ...item,
    input: { branchId: item.branchId, jobId: item.jobId, expectedAttempts: 5, incident: 'INC-013' },
  };
}
async function audits(jobId: string) {
  return f.database.db
    .select()
    .from(hostelAuditLog)
    .where(
      and(
        eq(hostelAuditLog.targetId, jobId),
        eq(hostelAuditLog.action, 'billing.job.recovery.requested'),
      ),
    );
}
it('AUD-013 / RENT-004 / ACC-004: explicit recovery after five failures resumes the same obligation exactly once', async () => {
  const item = await exhausted();
  const attempts = await Promise.allSettled([
    recoverResidentBilling(f.database.db, item.input),
    recoverResidentBilling(f.database.db, item.input),
  ]);
  expect(attempts.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
  expect(attempts.filter((row) => row.status === 'rejected')).toHaveLength(1);
  const history = await audits(item.jobId);
  expect(history).toHaveLength(1);
  expect(history[0]).toMatchObject({
    actorUserId: null,
    actorRole: 'system',
    before: { status: 'dead', attempts: 5, lastError: 'DELIVERY_FAILED' },
    after: {
      status: 'pending',
      attempts: 0,
      incident: 'INC-013',
      scheduleVersion: 1,
      periodIndex: 0,
    },
  });
  const leased = await new OutboxRepository(f.database.db).claim(item.jobId, new Date());
  expect(leased?.attempts).toBe(1);
  if (!leased) throw new Error('Recovered lease missing');
  await Promise.all([
    deliverResidentBilling(f.database.db, leased),
    deliverResidentBilling(f.database.db, leased),
  ]);
  const invoices = await f.database.db
    .select()
    .from(residentInvoices)
    .where(eq(residentInvoices.stayId, item.stayId));
  const executions = await f.database.db
    .select()
    .from(residentBillingExecutions)
    .where(eq(residentBillingExecutions.jobId, item.jobId));
  expect(invoices).toHaveLength(1);
  expect(executions).toHaveLength(1);
  expect(executions[0]).toMatchObject({
    outcome: 'posted',
    periodIndex: 0n,
    invoiceId: invoices[0]?.id,
  });
  const [job] = await f.database.db
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.id, item.jobId));
  expect(job).toMatchObject({ status: 'sent', leaseToken: null, leaseExpiresAt: null });
  const [schedule] = await f.database.db
    .select()
    .from(residentBillingSchedules)
    .where(eq(residentBillingSchedules.id, item.scheduleId));
  expect(schedule).toMatchObject({
    state: 'exhausted',
    version: 2,
    periodIndex: 1n,
    currentJobId: null,
  });
  const completed = await f.database.db
    .select()
    .from(hostelAuditLog)
    .where(
      and(
        eq(hostelAuditLog.branchId, item.branchId),
        eq(hostelAuditLog.action, 'billing.execution.completed'),
      ),
    );
  expect(completed).toHaveLength(1);
  await expect(recoverResidentBilling(f.database.db, item.input)).rejects.toThrow(
    'Billing recovery unavailable',
  );
  expect(await audits(item.jobId)).toHaveLength(1);
});
it.each(['branch', 'attempts', 'invalid', 'pending', 'archived', 'stopped'] as const)(
  'AUD-013 / SEC-003: %s work cannot receive a recovery budget',
  async (mode) => {
    const item = await exhausted(mode !== 'stopped');
    const input = { ...item.input };
    if (mode === 'branch') input.branchId = randomUUID();
    if (mode === 'attempts') input.expectedAttempts = 6;
    if (mode === 'invalid')
      await f.database.db
        .update(notificationOutbox)
        .set({ lastError: 'INVALID_MESSAGE' })
        .where(eq(notificationOutbox.id, item.jobId));
    if (mode === 'pending')
      await f.database.db
        .update(notificationOutbox)
        .set({ status: 'pending' })
        .where(eq(notificationOutbox.id, item.jobId));
    if (mode === 'archived')
      await f.database.db
        .update(branches)
        .set({ archivedAt: new Date() })
        .where(eq(branches.id, item.branchId));
    await expect(recoverResidentBilling(f.database.db, input)).rejects.toThrow(
      'Billing recovery unavailable',
    );
    expect(await audits(item.jobId)).toHaveLength(0);
    expect(
      await f.database.db
        .select()
        .from(residentInvoices)
        .where(eq(residentInvoices.stayId, item.stayId)),
    ).toHaveLength(0);
  },
);
it('AUD-013 / ACC-004: actual mandatory audit failure rolls back recovery and permits a later explicit retry', async () => {
  const item = await exhausted();
  await f.database.db.execute(
    // eslint-disable-next-line no-secrets/no-secrets -- Public audit action in a disposable failure trigger, not a secret.
    sql`create function hsm_test_recovery_audit_failure() returns trigger language plpgsql as $$ begin if NEW.action='billing.job.recovery.requested' then raise exception 'Fixture recovery audit failure' using errcode='23514'; end if; return NEW; end; $$`,
  );
  await f.database.db.execute(
    sql`create trigger hsm_test_recovery_audit_failure before insert on hostel_audit_log for each row execute function hsm_test_recovery_audit_failure()`,
  );
  try {
    await expect(recoverResidentBilling(f.database.db, item.input)).rejects.toThrow();
    const [job] = await f.database.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.id, item.jobId));
    expect(job).toMatchObject({ status: 'dead', attempts: 5, lastError: 'DELIVERY_FAILED' });
    expect(await audits(item.jobId)).toHaveLength(0);
  } finally {
    await f.database.db.execute(
      sql`drop trigger hsm_test_recovery_audit_failure on hostel_audit_log`,
    );
    await f.database.db.execute(sql`drop function hsm_test_recovery_audit_failure()`);
  }
  await expect(recoverResidentBilling(f.database.db, item.input)).resolves.toEqual({
    status: 'pending',
  });
  expect(await audits(item.jobId)).toHaveLength(1);
});
