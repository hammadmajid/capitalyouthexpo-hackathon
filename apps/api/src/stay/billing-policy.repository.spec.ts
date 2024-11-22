import { beforeEach, expect, it, vi } from 'vitest';
import { billingPolicies, stayAgreements } from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import {
  billingActor as actor,
  billingIds as ids,
  billingNow as now,
  billingScope as scope,
  billingPolicyFixture as policy,
  billingRow,
} from '../../test/unit/billing-policy.fixture.js';
import { AuditWriter } from '../audit/writer.js';
import { billingSettingsScope } from './billing-policy.scope.js';
import { BillingPolicyRepository } from './billing-policy.repository.js';
vi.mock('./billing-policy.scope.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./billing-policy.scope.js')>();
  return { ...original, billingSettingsScope: vi.fn() };
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(billingSettingsScope).mockResolvedValue(scope);
});
it('RENT-001/003: unconfigured policy returns explicit absence and never guessed defaults', async () => {
  const store = queryFixture();
  expect(
    await new BillingPolicyRepository(store.database).read(actor, { branchId: ids.branch }),
  ).toEqual({
    target: { branchId: ids.branch },
    canEdit: true,
    localVersion: null,
    effectiveVersion: null,
  });
  expect(store.operations).toContainEqual({ table: billingPolicies, kind: 'limit', args: [4] });
});
it.each(['platform', 'hostel', 'branch', 'room_type'] as const)(
  'RENT-003: nearest available %s policy resolves without changing historical agreements',
  async (level) => {
    const store = queryFixture();
    const platform = billingRow(),
      hostel = billingRow({ brandId: ids.brand }),
      branch = billingRow({ branchId: ids.branch }),
      type = billingRow({ branchId: ids.branch, roomTypeId: ids.type });
    const rows =
      level === 'platform'
        ? [platform]
        : level === 'hostel'
          ? [platform, hostel]
          : level === 'branch'
            ? [platform, hostel, branch]
            : [platform, hostel, branch, type];
    store.enqueue(billingPolicies, rows);
    const result = await new BillingPolicyRepository(store.database).read(actor, {
      branchId: ids.branch,
      roomTypeId: ids.type,
    });
    expect(result.effectiveVersion?.level).toBe(level);
    expect(result.effectiveVersion?.policy).toEqual(policy);
    expect(result.localVersion?.level ?? null).toBe(level === 'room_type' ? 'room_type' : null);
    expect(store.writes).toHaveLength(0);
  },
);
it('RENT-003 / ACC-004: assigned Manager can read but never gains canEdit from existing booking policy grants', async () => {
  const store = queryFixture();
  vi.mocked(billingSettingsScope).mockResolvedValue({ ...scope, actorRole: 'manager' });
  store.enqueue(billingPolicies, [billingRow({ branchId: ids.branch })]);
  const result = await new BillingPolicyRepository(store.database).read(actor, {
    branchId: ids.branch,
  });
  expect(result.canEdit).toBe(false);
  expect(result.localVersion?.level).toBe('branch');
});
it.each([false, true])(
  'RENT-003: append policy (room-type=%s) supersedes only the local version and audits atomically',
  async (typed) => {
    const store = queryFixture(),
      audit = new AuditWriter();
    const writeAudit = vi.spyOn(audit, 'hostel').mockResolvedValue();
    const target = { branchId: ids.branch, ...(typed ? { roomTypeId: ids.type } : {}) };
    const previous = billingRow({ branchId: ids.branch });
    store.enqueue(billingPolicies, [previous]);
    const repository = new BillingPolicyRepository(store.database, audit, () => now);
    expect(await repository.authorize(store.transaction, actor, target)).toBe(true);
    const result = await repository.save(store.transaction, actor, target, policy);
    expect(result.level).toBe(typed ? 'room_type' : 'branch');
    expect(
      store.writes.filter((row) => row.table === billingPolicies && row.kind === 'update'),
    ).toEqual([{ table: billingPolicies, kind: 'update', value: { isCurrent: false } }]);
    expect(store.writes.find((row) => row.kind === 'insert')?.value).toMatchObject({
      branchId: ids.branch,
      roomTypeId: typed ? ids.type : null,
      policy,
      isCurrent: true,
    });
    expect(store.writes.some((row) => row.table === stayAgreements)).toBe(false);
    expect(writeAudit).toHaveBeenCalledWith(
      store.transaction,
      expect.objectContaining({
        branchId: ids.branch,
        action: 'billing.policy.versioned',
        after: result,
      }),
    );
  },
);
it('AUD-004: mandatory audit failure propagates to the surrounding database/idempotency transaction', async () => {
  const store = queryFixture(),
    audit = new AuditWriter();
  vi.spyOn(audit, 'hostel').mockRejectedValue(new Error('audit unavailable'));
  await expect(
    new BillingPolicyRepository(store.database, audit).save(
      store.transaction,
      actor,
      { branchId: ids.branch },
      policy,
    ),
  ).rejects.toThrow('audit unavailable');
});
