import { afterAll, beforeAll, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { inventoryHarness } from './inventory.fixture.js';
import {
  manualAdmissionScope as scope,
  manualCommand as command,
  runManualAdmission as run,
  manualBranchRows as rows,
  totalAdmissionOutbox,
} from './manual-admission.fixture.js';
const harness = inventoryHarness();
beforeAll(() => harness.start());
afterAll(() => harness.close());
it('AUD-004 / ACC-004: actual mandatory audit failure rolls back resident, occupancy, agreement, initial billing and history, then same intent can retry', async () => {
  const f = await scope(harness),
    count = await totalAdmissionOutbox(harness);
  await harness
    .database()
    .execute(
      sql`create function hsm_test_manual_audit_failure() returns trigger language plpgsql as $$ begin if NEW.action = 'resident.manual.admitted' then raise exception 'Fixture admission audit failure' using errcode='P0001'; end if; return NEW; end; $$`,
    );
  await harness
    .database()
    .execute(
      sql`create trigger hsm_test_manual_audit_failure before insert on hostel_audit_log for each row execute function hsm_test_manual_audit_failure()`,
    );
  try {
    await expect(run(harness, command(f))).rejects.toThrow();
    expect(await rows(harness, f.branchId)).toEqual(Array.from({ length: 10 }, () => 0));
    expect(await totalAdmissionOutbox(harness)).toBe(count);
  } finally {
    await harness
      .database()
      .execute(sql`drop trigger if exists hsm_test_manual_audit_failure on hostel_audit_log`);
    await harness.database().execute(sql`drop function if exists hsm_test_manual_audit_failure()`);
  }
  expect((await run(harness, command(f))).state).toBe('active');
});
it('NTF-002 / ACC-004: actual required lifecycle event failure rolls back the entire admission graph including financial sources and audits', async () => {
  const f = await scope(harness),
    count = await totalAdmissionOutbox(harness);
  await harness
    .database()
    .execute(
      sql`create function hsm_test_manual_event_failure() returns trigger language plpgsql as $$ begin if NEW.event_type = 'resident.lifecycle' then raise exception 'Fixture admission event failure' using errcode='P0001'; end if; return NEW; end; $$`,
    );
  await harness
    .database()
    .execute(
      sql`create trigger hsm_test_manual_event_failure before insert on notification_outbox for each row execute function hsm_test_manual_event_failure()`,
    );
  try {
    await expect(run(harness, command(f))).rejects.toThrow();
    expect(await rows(harness, f.branchId)).toEqual(Array.from({ length: 10 }, () => 0));
    expect(await totalAdmissionOutbox(harness)).toBe(count);
  } finally {
    await harness
      .database()
      .execute(sql`drop trigger if exists hsm_test_manual_event_failure on notification_outbox`);
    await harness.database().execute(sql`drop function if exists hsm_test_manual_event_failure()`);
  }
  expect((await run(harness, command(f))).state).toBe('active');
});
