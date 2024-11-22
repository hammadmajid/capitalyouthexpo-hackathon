import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { stays } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import { lockActor } from '../auth/actor-lock.js';
import { lockParticipants } from '../management/identity-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
import { lockPaymentAuthority, paymentCommandContext } from './payment.scope.js';
import { queryFixture } from '../../test/unit/query-fixture.js';
import {
  paymentActor as actor,
  paymentIds as ids,
  paymentNow as now,
  paymentStay,
  paymentAuthority,
} from '../../test/unit/stay-payment.fixture.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('../management/identity-lock.js', () => ({ lockParticipants: vi.fn() }));
vi.mock('../inventory/scope.js', () => ({ lockInventoryScope: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(lockInventoryScope).mockResolvedValue(paymentAuthority);
});
it('PAY-008 / ACC-002: live finance_view plus payment_record required before exact Stay write lock', async () => {
  const f = queryFixture();
  f.enqueue(stays, [paymentStay]);
  expect(await lockPaymentAuthority(f.transaction, actor, ids.branch, ids.stay, () => now)).toEqual(
    { ...paymentAuthority, userId: ids.customer },
  );
  expect(vi.mocked(lockInventoryScope).mock.calls.map((row) => row[3])).toEqual([
    'finance_view',
    'payment_record',
  ]);
  expect(lockActor).toHaveBeenCalledTimes(2);
  expect(f.locks).toEqual([{ table: stays, mode: 'update' }]);
});
it.each(['finance_view', 'payment_record'] as const)(
  'ACC-002: denial of%s stops before Stay financial access',
  async (permission) => {
    vi.mocked(lockInventoryScope).mockImplementation(async (_tx, _actor, _branch, grant) => {
      if (grant === permission) throw new DomainError('FORBIDDEN', 403, 'Permission unavailable');
      return paymentAuthority;
    });
    const f = queryFixture();
    await expect(
      lockPaymentAuthority(f.transaction, actor, ids.branch, ids.stay, () => now),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(f.predicates).toEqual([]);
  },
);
it('SEC-003: revoked actor cannot look up branch or Stay', async () => {
  vi.mocked(lockActor).mockRejectedValue(
    new DomainError('UNAUTHENTICATED', 401, 'Session revoked'),
  );
  const f = queryFixture();
  await expect(
    lockPaymentAuthority(f.transaction, actor, ids.branch, ids.stay, () => now),
  ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  expect(lockInventoryScope).not.toHaveBeenCalled();
});
it.each([
  { rows: [], code: 'NOT_FOUND' },
  { rows: [{ ...paymentStay, id: randomUUID() }], code: 'INTERNAL' },
  { rows: [{ ...paymentStay, branchId: randomUUID() }], code: 'INTERNAL' },
])('SEC-003: absent/corrupt payment Stay %# fails closed', async ({ rows, code }) => {
  const f = queryFixture();
  f.enqueue(stays, rows);
  await expect(
    lockPaymentAuthority(f.transaction, actor, ids.branch, ids.stay, () => now),
  ).rejects.toMatchObject({ code });
});
it.each([ids.customer, null])(
  'SEC-003: preflight link%s selects sorted participant lock or actor-only lock before idempotent work',
  async (userId) => {
    const f = queryFixture();
    f.enqueue(stays, [{ ...paymentStay, userId }]);
    const context = await paymentCommandContext(f.database, actor, ids.branch, ids.stay, () => now);
    expect(context.userId).toBe(userId);
    vi.mocked(lockActor).mockClear();
    await context.store.transaction(actor, now, async () => undefined);
    if (userId === null) {
      expect(lockActor).toHaveBeenCalledWith(f.transaction, actor, expect.any(Function));
      expect(lockParticipants).not.toHaveBeenCalled();
    } else {
      expect(lockParticipants).toHaveBeenCalledWith(
        f.transaction,
        actor,
        userId,
        expect.any(Function),
      );
      expect(lockActor).not.toHaveBeenCalled();
    }
  },
);
