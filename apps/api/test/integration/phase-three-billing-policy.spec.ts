import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  billingPolicies,
  hostelAuditLog,
  managerAssignments,
  managerInventoryGrants,
} from '@hsm/db';
import {
  billingPolicySchema,
  billingPolicyVersionSchema,
  billingSettingsReadSchema,
} from '@hsm/contracts';
import { AuditWriter } from '../../src/audit/writer.js';
import { BillingPolicyRepository } from '../../src/stay/billing-policy.repository.js';
import { phaseTwoFixture } from './phase-two-fixture.js';
import { billingPolicyFixture as policy } from '../unit/billing-policy.fixture.js';
let fixture: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  fixture = await phaseTwoFixture(new Date('2026-10-18T10:00:00.000Z'));
});
afterAll(async () => {
  await fixture?.close();
});
const url = (branchId: string) => `/v1/branches/${branchId}/billing-policy`;
function headers(token = fixture.ownerToken, key = randomUUID()) {
  return { authorization: 'Bearer ' + token, 'Idempotency-Key': key };
}
function save(branchId: string, body = policy, key = randomUUID(), token = fixture.ownerToken) {
  return fixture.application.inject({
    url: url(branchId),
    method: 'PUT',
    headers: headers(token, key),
    payload: { policy: body },
  });
}
it('RENT-003 / AUD-004: actual HTTP policy versions retain immutable history, one current version and mandatory audit', async () => {
  const inventory = await fixture.inventory(),
    key = randomUUID();
  const absent = await fixture.application.inject({
    url: url(inventory.branchId),
    headers: headers(),
  });
  expect(absent.statusCode).toBe(200);
  expect(billingSettingsReadSchema.parse(absent.json()).effectiveVersion).toBeNull();
  const first = await save(inventory.branchId, policy, key);
  expect(first.statusCode).toBe(200);
  const version = billingPolicyVersionSchema.parse(first.json());
  const replay = await save(inventory.branchId, policy, key);
  expect(replay.statusCode).toBe(200);
  expect(replay.headers['idempotency-replayed']).toBe('true');
  expect(billingPolicyVersionSchema.parse(replay.json()).id).toBe(version.id);
  expect((await save(inventory.branchId, { ...policy, noticeDays: 21 }, key)).statusCode).toBe(409);
  expect((await save(inventory.branchId, { ...policy, noticeDays: 21 })).statusCode).toBe(200);
  const rows = await fixture.connection.db
    .select()
    .from(billingPolicies)
    .where(eq(billingPolicies.branchId, inventory.branchId));
  expect(rows).toHaveLength(2);
  expect(rows.filter((row) => row.isCurrent)).toHaveLength(1);
  expect(rows.find((row) => row.id === version.id)?.policy).toEqual(policy);
  expect(rows.find((row) => row.id === version.id)?.isCurrent).toBe(false);
  const audits = await fixture.connection.db
    .select()
    .from(hostelAuditLog)
    .where(
      and(
        eq(hostelAuditLog.branchId, inventory.branchId),
        eq(hostelAuditLog.action, 'billing.policy.versioned'),
      ),
    );
  expect(audits).toHaveLength(2);
});
it('ACC-004 / RENT-003: persisted room-type policy cannot be read or written through another branch', async () => {
  const own = await fixture.inventory(),
    foreign = await fixture.inventory();
  await save(own.branchId);
  const target = url(own.branchId).replace(
    '/billing-policy',
    '/inventory/room-types/' + own.roomTypeId + '/billing-policy',
  );
  const response = await fixture.application.inject({
    url: target,
    method: 'PUT',
    headers: headers(),
    payload: { policy: { ...policy, graceDays: 7 } },
  });
  expect(response.statusCode).toBe(200);
  const read = await fixture.application.inject({ url: target, headers: headers() });
  expect(billingSettingsReadSchema.parse(read.json()).effectiveVersion?.policy.graceDays).toBe(7);
  const outside = target.replace(own.branchId, foreign.branchId);
  expect((await fixture.application.inject({ url: outside, headers: headers() })).statusCode).toBe(
    404,
  );
  expect(
    (
      await fixture.application.inject({
        url: outside,
        method: 'PUT',
        headers: headers(),
        payload: { policy },
      })
    ).statusCode,
  ).toBe(404);
  const untouched = await fixture.application.inject({
    url: url(foreign.branchId),
    headers: headers(),
  });
  expect(billingSettingsReadSchema.parse(untouched.json()).effectiveVersion).toBeNull();
});
it('ACC-004: real assigned Manager reads only own branch, cannot write with booking grants, and revocation is immediate', async () => {
  const own = await fixture.inventory(),
    foreign = await fixture.inventory(),
    assignmentId = randomUUID();
  await fixture.connection.db.insert(managerAssignments).values({
    id: assignmentId,
    userId: fixture.customerB,
    branchId: own.branchId,
    status: 'active',
    appointedByUserId: fixture.ownerId,
    activatedAt: fixture.now,
  });
  await fixture.connection.db
    .insert(managerInventoryGrants)
    .values({ assignmentId, permission: 'policy_edit' });
  const response = await fixture.application.inject({
    url: url(own.branchId),
    headers: headers(fixture.customerBToken),
  });
  expect(response.statusCode).toBe(200);
  expect(billingSettingsReadSchema.parse(response.json()).canEdit).toBe(false);
  expect((await save(own.branchId, policy, randomUUID(), fixture.customerBToken)).statusCode).toBe(
    403,
  );
  expect(
    (
      await fixture.application.inject({
        url: url(foreign.branchId),
        headers: headers(fixture.customerBToken),
      })
    ).statusCode,
  ).toBe(403);
  await fixture.connection.db
    .update(managerAssignments)
    .set({ status: 'deactivated' })
    .where(eq(managerAssignments.id, assignmentId));
  expect(
    (
      await fixture.application.inject({
        url: url(own.branchId),
        headers: headers(fixture.customerBToken),
      })
    ).statusCode,
  ).toBe(403);
});
it('RENT-003 / ACC-001: concurrent policy writes leave exactly one current immutable version', async () => {
  const own = await fixture.inventory();
  const responses = await Promise.all([
    save(own.branchId),
    save(own.branchId, { ...policy, noticeDays: 30 }),
  ]);
  expect(responses.map((row) => row.statusCode)).toEqual([200, 200]);
  const rows = await fixture.connection.db
    .select()
    .from(billingPolicies)
    .where(eq(billingPolicies.branchId, own.branchId));
  expect(rows).toHaveLength(2);
  expect(rows.filter((row) => row.isCurrent)).toHaveLength(1);
});
it('AUD-004 / RENT-003: actual audit failure rolls back supersession, insert and idempotency cache before retry', async () => {
  const own = await fixture.inventory(),
    key = randomUUID();
  const original = await save(own.branchId);
  expect(original.statusCode).toBe(200);
  const version = billingPolicyVersionSchema.parse(original.json());
  const audit = vi
    .spyOn(AuditWriter.prototype, 'hostel')
    .mockRejectedValueOnce(new Error('Audit fault injection'));
  try {
    expect((await save(own.branchId, { ...policy, noticeDays: 30 }, key)).statusCode).toBe(500);
  } finally {
    audit.mockRestore();
  }
  const rows = await fixture.connection.db
    .select()
    .from(billingPolicies)
    .where(eq(billingPolicies.branchId, own.branchId));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.id).toBe(version.id);
  expect(rows[0]?.isCurrent).toBe(true);
  const retry = await save(own.branchId, { ...policy, noticeDays: 30 }, key);
  expect(retry.statusCode).toBe(200);
  expect(retry.headers['idempotency-replayed']).toBe('false');
});

it('FIN-004 / RENT-003: real Owner policy versions retain distinct fee cadence and original history', async () => {
  const own = await fixture.inventory();
  const configured = billingPolicySchema.parse({
    ...policy,
    cycle: { kind: 'week', dueOffsetDays: 2 },
    feeBilling: {
      oneTimeDueOffsetDays: 0,
      monthly: {
        cycle: { kind: 'anniversary_month', dueOffsetDays: 1 },
        proration: { kind: 'calendar_days', rounding: 'down' },
      },
    },
  });
  const first = await save(own.branchId, configured);
  expect(first.statusCode).toBe(200);
  const original = billingPolicyVersionSchema.parse(first.json());
  expect(original.policy).toEqual(configured);
  const current = await fixture.application.inject({ url: url(own.branchId), headers: headers() });
  expect(billingSettingsReadSchema.parse(current.json()).effectiveVersion?.policy).toEqual(
    configured,
  );
  const amended = {
    ...configured,
    feeBilling: { ...configured.feeBilling, oneTimeDueOffsetDays: 3 },
  };
  expect((await save(own.branchId, amended)).statusCode).toBe(200);
  const rows = await fixture.connection.db
    .select()
    .from(billingPolicies)
    .where(eq(billingPolicies.branchId, own.branchId));
  expect(rows).toHaveLength(2);
  expect(rows.find((row) => row.id === original.id)?.policy).toEqual(configured);
  expect(rows.filter((row) => row.isCurrent)).toHaveLength(1);
});

it.each(['branch', 'room_type'] as const)(
  'RENT-003 / AUD-004: real %s policy response failure rolls back persisted version, audit and replay before retry',
  async (level) => {
    const own = await fixture.inventory(),
      key = randomUUID();
    const path =
      level === 'branch'
        ? url(own.branchId)
        : url(own.branchId).replace(
            '/billing-policy',
            '/inventory/room-types/' + own.roomTypeId + '/billing-policy',
          );
    const invoke = (body: typeof policy, commandKey = randomUUID()) =>
      fixture.application.inject({
        method: 'PUT',
        url: path,
        headers: headers(fixture.ownerToken, commandKey),
        payload: { policy: body },
      });
    const first = await invoke(policy);
    expect(first.statusCode).toBe(200);
    const originalVersion = billingPolicyVersionSchema.parse(first.json());
    const implementation = BillingPolicyRepository.prototype.save;
    const fault = vi
      .spyOn(BillingPolicyRepository.prototype, 'save')
      .mockImplementationOnce(async function (
        this: BillingPolicyRepository,
        ...args: Parameters<BillingPolicyRepository['save']>
      ) {
        const persisted = await implementation.apply(this, args);
        return {
          ...persisted,
          policy: { ...persisted.policy, graceDays: persisted.policy.graceDays + 1 },
        };
      });
    const changed = { ...policy, noticeDays: 30 };
    try {
      const rejected = await invoke(changed, key);
      expect(rejected.statusCode).toBe(500);
      expect(rejected.json()).toMatchObject({ code: 'INTERNAL', status: 500 });
      expect(rejected.json()).not.toHaveProperty('errors');
    } finally {
      fault.mockRestore();
    }
    const rows = await fixture.connection.db
      .select()
      .from(billingPolicies)
      .where(eq(billingPolicies.branchId, own.branchId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(originalVersion.id);
    expect(rows[0]?.isCurrent).toBe(true);
    expect(rows[0]?.policy).toEqual(policy);
    const audits = await fixture.connection.db
      .select()
      .from(hostelAuditLog)
      .where(
        and(
          eq(hostelAuditLog.branchId, own.branchId),
          eq(hostelAuditLog.action, 'billing.policy.versioned'),
        ),
      );
    expect(audits).toHaveLength(1);
    const retry = await invoke(changed, key);
    expect(retry.statusCode).toBe(200);
    expect(retry.headers['idempotency-replayed']).toBe('false');
    expect(billingPolicyVersionSchema.parse(retry.json()).policy).toEqual(changed);
    const replay = await invoke(changed, key);
    expect(replay.statusCode).toBe(200);
    expect(replay.headers['idempotency-replayed']).toBe('true');
  },
);
