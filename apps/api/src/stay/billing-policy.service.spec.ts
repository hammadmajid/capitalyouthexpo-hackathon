import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { DomainError, billingPolicySchema } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import {
  billingActor as actor,
  billingIds as ids,
  billingNow as now,
  billingPolicyFixture as policy,
} from '../../test/unit/billing-policy.fixture.js';
import { IdempotencyService } from '../idempotency/service.js';
import type { IdempotencyStore, StoredResponse } from '../idempotency/store.js';
import { requireTransaction } from '../idempotency/context.js';
import { BillingPolicyRepository } from './billing-policy.repository.js';
import { BillingPolicyService } from './billing-policy.service.js';
const target = { branchId: ids.branch };
const result = {
  id: randomUUID(),
  level: 'branch' as const,
  scopeId: ids.branch,
  policy,
  createdAt: now.toISOString(),
};
function fixture() {
  const query = queryFixture(),
    responses = new Map<string, StoredResponse>();
  const store: IdempotencyStore = {
    transaction: async (_actor, _now, work) =>
      work({
        database: query.transaction,
        read: async (key) => responses.get(key),
        remove: async (key) => {
          responses.delete(key);
        },
        save: async (key, value) => {
          responses.set(key, value);
        },
      }),
  };
  const repository = new BillingPolicyRepository(query.database);
  const authorize = vi.spyOn(repository, 'authorize').mockResolvedValue(true);
  const save = vi.spyOn(repository, 'save').mockImplementation(async (transaction) => {
    expect(requireTransaction()).toBe(transaction);
    return result;
  });
  const read = vi
    .spyOn(repository, 'read')
    .mockResolvedValue({ target, canEdit: true, localVersion: result, effectiveVersion: result });
  return {
    authorize,
    save,
    read,
    responses,
    service: new BillingPolicyService(repository, new IdempotencyService(store, () => now)),
  };
}
it('RENT-003 / ACC-004: one canonical policy write replays only after rechecking current Owner authority', async () => {
  const value = fixture(),
    key = randomUUID();
  expect(
    (await value.service.save(actor, key, { branchId: ids.branch.toUpperCase() }, { policy })).body,
  ).toEqual(result);
  expect((await value.service.save(actor, key, target, { policy })).replayed).toBe(true);
  expect(value.save).toHaveBeenCalledTimes(1);
  expect(value.authorize).toHaveBeenCalledTimes(2);
  value.authorize.mockRejectedValueOnce(new DomainError('BRANCH_FORBIDDEN', 403, 'Owner changed'));
  await expect(value.service.save(actor, key, target, { policy })).rejects.toMatchObject({
    code: 'BRANCH_FORBIDDEN',
  });
  expect(value.save).toHaveBeenCalledTimes(1);
});
it('RENT-003 / ACC-004: same key cannot alias a different room-type or policy payload', async () => {
  const value = fixture(),
    key = randomUUID();
  await value.service.save(actor, key, target, { policy });
  await expect(
    value.service.save(actor, key, { ...target, roomTypeId: ids.type }, { policy }),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  await expect(
    value.service.save(actor, key, target, { policy: { ...policy, graceDays: 8 } }),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  expect(value.save).toHaveBeenCalledTimes(1);
});
it('RENT-001/003: invalid policy and injected financial fields fail before repository authorization', () => {
  const value = fixture();
  expect(() =>
    value.service.save(actor, randomUUID(), target, { policy: { ...policy, graceDays: -1 } }),
  ).toThrow();
  expect(() => value.service.save(actor, randomUUID(), target, { policy, paid: true })).toThrow();
  expect(value.authorize).not.toHaveBeenCalled();
});
it('ACC-004: read normalizes scope and refuses unrecognized query data', async () => {
  const value = fixture();
  expect((await value.service.read(actor, { branchId: ids.branch.toUpperCase() })).canEdit).toBe(
    true,
  );
  expect(value.read).toHaveBeenCalledWith(actor, target);
  expect(() => value.service.read(actor, target, { customerId: randomUUID() })).toThrow();
});

it('FIN-004 / ACC-004: explicit fee timing is persisted unchanged and binds idempotent policy intent', async () => {
  const value = fixture(),
    key = randomUUID();
  const configured = billingPolicySchema.parse({
    ...policy,
    cycle: { kind: 'week', dueOffsetDays: 2 },
    feeBilling: {
      oneTimeDueOffsetDays: 0,
      monthly: {
        cycle: { kind: 'calendar_month', dueDay: 5 },
        proration: { kind: 'calendar_days', rounding: 'half_up' },
      },
    },
  });
  value.save.mockImplementation(async (transaction, _actor, _target, parsed) => {
    expect(requireTransaction()).toBe(transaction);
    return { ...result, policy: parsed };
  });
  const saved = await value.service.save(actor, key, target, { policy: configured });
  expect(saved.body.policy).toEqual(configured);
  expect(value.save.mock.calls[0]?.[3]).toEqual(configured);
  await expect(
    value.service.save(actor, key, target, {
      policy: { ...configured, feeBilling: { ...configured.feeBilling, oneTimeDueOffsetDays: 1 } },
    }),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  expect(value.save).toHaveBeenCalledTimes(1);
});
it('FIN-004: invalid fee cadence is rejected before privileged policy authorization or writes', () => {
  const value = fixture();
  expect(() =>
    value.service.save(actor, randomUUID(), target, {
      policy: {
        ...policy,
        feeBilling: {
          oneTimeDueOffsetDays: 0,
          monthly: {
            cycle: { kind: 'week', dueOffsetDays: 0 },
            proration: { kind: 'full_period' },
          },
        },
      },
    }),
  ).toThrow();
  expect(value.authorize).not.toHaveBeenCalled();
  expect(value.save).not.toHaveBeenCalled();
});
