import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { v7 } from 'uuid';
import { residents, users, hostelAuditLog } from '../src/index.js';
import { resolveResidentAdmissionParty } from '../src/resident-admission-party.js';
import { inventoryHarness, type InventoryFixture } from './inventory.fixture.js';
const harness = inventoryHarness(),
  now = new Date('2028-02-01T06:00:00Z');
beforeAll(() => harness.start());
afterAll(() => harness.close());
const scope = (f: InventoryFixture) => ({
  organizationId: f.organizationId,
  branchId: f.branchId,
  actorUserId: f.ownerId,
  actorRole: 'owner',
});
const input = (f: InventoryFixture) => ({
  scope: scope(f),
  resident: {
    kind: 'new',
    profile: { displayName: 'Offline resident', email: f.customerA + '@example.invalid' },
  },
  expectedUserId: null,
});
function run(value: unknown) {
  return harness.database().transaction((tx) => resolveResidentAdmissionParty(tx, value, now));
}
async function relationships(branchId: string) {
  return harness.database().select().from(residents).where(eq(residents.branchId, branchId));
}
async function userCount() {
  const [row] = await harness
    .database()
    .select({ count: sql<string>`count(*)::text` })
    .from(users);
  if (!row) throw Error('User count missing');
  return row.count;
}
async function insertExisting(f: InventoryFixture, userId: string | null) {
  const id = v7();
  await harness.database().insert(residents).values({
    id,
    branchId: f.branchId,
    userId,
    displayName: 'Existing relationship',
    createdByUserId: f.ownerId,
  });
  return id;
}
const existing = (f: InventoryFixture, residentId: string, expectedUserId: string | null) => ({
  scope: scope(f),
  resident: { kind: 'existing', residentId },
  expectedUserId,
});
// Actual SQL relationship component cases, not live HTTP/session/link-consent acceptance.
it('RES-001/003 / AUD-004: matching actual account contacts never create a login, merge identities or implicitly link a manual resident', async () => {
  const f = await harness.scope(),
    email = f.customerA + '@example.invalid';
  await harness
    .database()
    .update(users)
    .set({ email, phoneE164: '+923001234567', emailVerifiedAt: now })
    .where(eq(users.id, f.customerA));
  const [before] = await harness.database().select().from(users).where(eq(users.id, f.customerA)),
    count = await userCount();
  const value = {
    ...input(f),
    resident: {
      kind: 'new',
      profile: { displayName: 'Offline resident', email, phone: '+923001234567' },
    },
  };
  const first = await run(value),
    second = await run(value);
  expect(first.residentId).not.toBe(second.residentId);
  expect(first.userId).toBeNull();
  expect(second.userId).toBeNull();
  expect(await userCount()).toBe(count);
  expect(
    (await harness.database().select().from(users).where(eq(users.id, f.customerA)))[0],
  ).toEqual(before);
  const rows = await relationships(f.branchId);
  expect(rows).toHaveLength(2);
  expect(rows.every((row) => row.userId === null)).toBe(true);
  const audit = await harness
    .database()
    .select()
    .from(hostelAuditLog)
    .where(eq(hostelAuditLog.branchId, f.branchId));
  expect(audit).toHaveLength(2);
  expect(
    audit.every(
      (row) => row.action === 'resident.relationship.created' && row.actorUserId === f.ownerId,
    ),
  ).toBe(true);
});
it('RES-001: actual existing offline relationship is reused rather than duplicated or given credentials', async () => {
  const f = await harness.scope(),
    id = await insertExisting(f, null),
    count = await userCount();
  expect(await run(existing(f, id, null))).toMatchObject({ residentId: id, userId: null });
  expect(await relationships(f.branchId)).toHaveLength(1);
  expect(await userCount()).toBe(count);
});
it('RES-003: actual explicitly linked relationship retains the exact preflight identity without a new User', async () => {
  const f = await harness.scope(),
    id = await insertExisting(f, f.customerA),
    count = await userCount();
  expect(await run(existing(f, id, f.customerA))).toMatchObject({
    residentId: id,
    userId: f.customerA,
  });
  expect(await userCount()).toBe(count);
  expect(await relationships(f.branchId)).toHaveLength(1);
});
it('SEC-003: actual foreign relationship remains404 under a different branch scope', async () => {
  const f = await harness.scope(),
    foreign = await harness.scope(),
    id = await insertExisting(foreign, null);
  await expect(run(existing(f, id, null))).rejects.toMatchObject({
    code: 'NOT_FOUND',
    status: 404,
  });
  expect(await relationships(f.branchId)).toEqual([]);
});
it('RES-003 / ACC-004: actual changed preflight link is rejected instead of acquiring an undeclared participant', async () => {
  const f = await harness.scope(),
    id = await insertExisting(f, f.customerA);
  await expect(run(existing(f, id, null))).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
  expect((await relationships(f.branchId))[0]?.userId).toBe(f.customerA);
});
it('RES-001: actual archived relationship is not silently restored by admission selection', async () => {
  const f = await harness.scope(),
    id = await insertExisting(f, null);
  await harness.database().update(residents).set({ archivedAt: now }).where(eq(residents.id, id));
  await expect(run(existing(f, id, null))).rejects.toMatchObject({ code: 'CONFLICT' });
  expect((await relationships(f.branchId))[0]?.archivedAt).toEqual(now);
});
it('AUD-004 / ACC-004: actual mandatory creation audit failure rolls back the relationship and leaves login identities untouched', async () => {
  const f = await harness.scope(),
    count = await userCount();
  await harness
    .database()
    .execute(
      sql`create function hsm_test_party_audit_failure() returns trigger language plpgsql as $$ begin if NEW.action = 'resident.relationship.created' then raise exception 'Fixture relationship audit failure' using errcode='P0001'; end if; return NEW; end; $$`,
    );
  await harness
    .database()
    .execute(
      sql`create trigger hsm_test_party_audit_failure before insert on hostel_audit_log for each row execute function hsm_test_party_audit_failure()`,
    );
  try {
    await expect(run(input(f))).rejects.toThrow();
    expect(await relationships(f.branchId)).toEqual([]);
    expect(await userCount()).toBe(count);
  } finally {
    await harness
      .database()
      .execute(sql`drop trigger if exists hsm_test_party_audit_failure on hostel_audit_log`);
    await harness.database().execute(sql`drop function if exists hsm_test_party_audit_failure()`);
  }
  expect((await run(input(f))).userId).toBeNull();
});
it('SEC-003 / AUD-004: actual organization/branch audit mismatch cannot commit an unaudited relationship', async () => {
  const f = await harness.scope(),
    foreign = await harness.scope(),
    value = input(f);
  await expect(
    run({ ...value, scope: { ...value.scope, organizationId: foreign.organizationId } }),
  ).rejects.toThrow();
  expect(await relationships(f.branchId)).toEqual([]);
});
