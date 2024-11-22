import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  DomainError,
  billingPolicyVersionSchema,
  type BillingSettingsTarget,
} from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import {
  billingActor as actor,
  billingIds as ids,
  billingNow as now,
  billingPolicyFixture as policy,
} from '../../test/unit/billing-policy.fixture.js';
import { IdempotencyService } from '../idempotency/service.js';
import type { IdempotencyStore, StoredResponse } from '../idempotency/store.js';
import { BillingPolicyRepository } from './billing-policy.repository.js';
import { BillingPolicyService } from './billing-policy.service.js';

function fixture(target: BillingSettingsTarget) {
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
  const result = billingPolicyVersionSchema.parse({
    id: randomUUID(),
    level: target.roomTypeId ? 'room_type' : 'branch',
    scopeId: target.roomTypeId ?? target.branchId,
    policy,
    createdAt: now.toISOString(),
  });
  const save = vi.spyOn(repository, 'save').mockResolvedValue(result);
  return {
    result,
    responses,
    authorize,
    save,
    service: new BillingPolicyService(repository, new IdempotencyService(store, () => now)),
  };
}
const cases = ['level', 'scope', 'policy'] as const;
const scopes: BillingSettingsTarget[] = [
  { branchId: ids.branch },
  { branchId: ids.branch, roomTypeId: ids.type },
];
for (const target of scopes) {
  for (const source of ['fresh', 'replay'] as const) {
    it.each(cases)(
      'RENT-003 / SEC-003: ' +
        (target.roomTypeId ? 'room-type' : 'branch') +
        ' ' +
        source +
        ' policy response binds %s to the authorized command',
      async (fault) => {
        const value = fixture(target),
          key = randomUUID();
        const wrong = billingPolicyVersionSchema.parse({
          ...value.result,
          ...(fault === 'level' ? { level: 'hostel' } : {}),
          ...(fault === 'scope' ? { scopeId: randomUUID() } : {}),
          ...(fault === 'policy' ? { policy: { ...policy, graceDays: policy.graceDays + 1 } } : {}),
        });
        if (source === 'fresh') value.save.mockResolvedValueOnce(wrong);
        else {
          await value.service.save(actor, key, target, { policy });
          const stored = value.responses.get(key);
          if (!stored) throw Error('Expected persisted command response');
          stored.responseBody = wrong;
        }
        await expect(value.service.save(actor, key, target, { policy })).rejects.toMatchObject({
          code: 'INTERNAL',
          status: 500,
        });
        expect(value.authorize).toHaveBeenCalledTimes(source === 'fresh' ? 1 : 2);
        expect(value.save).toHaveBeenCalledTimes(1);
        if (source === 'fresh') expect(value.responses.size).toBe(0);
      },
    );
    it(
      'SEC-003: ' +
        (target.roomTypeId ? 'room-type' : 'branch') +
        ' ' +
        source +
        ' authoritative parsing errors are server faults',
      async () => {
        const value = fixture(target),
          key = randomUUID();
        if (source === 'fresh') value.save.mockRejectedValueOnce(new z.ZodError([]));
        else {
          await value.service.save(actor, key, target, { policy });
          const stored = value.responses.get(key);
          if (!stored) throw Error('Expected persisted command response');
          stored.responseBody = { ...value.result, policy: { unexpected: true } };
        }
        await expect(value.service.save(actor, key, target, { policy })).rejects.toMatchObject({
          code: 'INTERNAL',
          status: 500,
        });
        expect(value.authorize).toHaveBeenCalledTimes(source === 'fresh' ? 1 : 2);
        expect(value.save).toHaveBeenCalledTimes(1);
      },
    );
  }
}

it('RENT-003: equivalent property order remains the same command', async () => {
  const target = scopes[0];
  if (!target) throw Error('Expected branch fixture');
  const value = fixture(target),
    key = randomUUID();
  const reordered = {
    customCharges: policy.customCharges,
    allowOpenEnded: policy.allowOpenEnded,
    earlyCheckout: policy.earlyCheckout,
    noticeDays: policy.noticeDays,
    lateCharge: policy.lateCharge,
    graceDays: policy.graceDays,
    proration: policy.proration,
    cycle: policy.cycle,
  };
  value.save.mockResolvedValueOnce({ ...value.result, policy: reordered });
  expect((await value.service.save(actor, key, target, { policy })).body).toEqual(value.result);
  expect((await value.service.save(actor, key, target, { policy: reordered })).replayed).toBe(true);
  expect(value.save).toHaveBeenCalledTimes(1);
});
it('SEC-003: invalid command key is a request error before authority or persistence', () => {
  const value = fixture({ branchId: ids.branch });
  expect(() => value.service.save(actor, 'invalid', { branchId: ids.branch }, { policy })).toThrow(
    z.ZodError,
  );
  expect(value.authorize).not.toHaveBeenCalled();
  expect(value.save).not.toHaveBeenCalled();
});
it('ACC-004: response hardening preserves live authorization errors before cached replay', async () => {
  const target = { branchId: ids.branch },
    value = fixture(target),
    key = randomUUID();
  await value.service.save(actor, key, target, { policy });
  value.authorize.mockRejectedValueOnce(new DomainError('BRANCH_FORBIDDEN', 403, 'Unavailable'));
  await expect(value.service.save(actor, key, target, { policy })).rejects.toMatchObject({
    code: 'BRANCH_FORBIDDEN',
    status: 403,
  });
  expect(value.save).toHaveBeenCalledTimes(1);
});
